package change

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/config"
)

// changeRecords owns the paired durable facts, not execution or a second cache.
// Every mutation reloads and validates both records in the shared Store update.
// An error never proves that the file was unchanged: the writer can fail after
// rename. Callers must stop advancement and later load the actual evidence.
type changeRecords struct{ store config.Repository }

type recordPair struct {
	pending *PendingRecord
	batch   *Batch
}

type recoveredRecords struct {
	request *Request
	batch   *Batch
}

// Resolved IDs are monotonic facts. Acknowledgement is checked against the
// actual on-disk identity during this command's update, never cached here.
// The check may briefly take Service.mu, but must not call storage or batchMu.
type recordEvidence struct {
	resolved     map[string]bool
	acknowledged func(string) bool
}

func (e recordEvidence) permitsReplacement(id string) bool {
	return e.resolved[id] || (e.acknowledged != nil && e.acknowledged(id))
}

const unknownRequestMessage = "上次修改结果未知；当前默认不证明旧请求已结束。"

var errRecordsUnchanged = errors.New("records unchanged")

func decodeRecords(doc config.Document) (recordPair, error) {
	var pair recordPair
	if len(doc.Pending) != 0 {
		pair.pending = &PendingRecord{}
		if err := json.Unmarshal(doc.Pending, pair.pending); err != nil {
			return recordPair{}, fmt.Errorf("待定修改记录损坏，已保留原文件：%w", err)
		}
	}
	if len(doc.Batch) != 0 {
		pair.batch = &Batch{}
		if err := json.Unmarshal(doc.Batch, pair.batch); err != nil {
			return recordPair{}, fmt.Errorf("批次记录损坏，已保留原文件：%w", err)
		}
	}
	return pair, pair.validate()
}

func (p recordPair) validate() error {
	if r := p.pending; r != nil && (r.RequestID == "" || r.Target.Path == "" || r.Association.Key == "" || !slices.Contains([]string{"file", "scheme"}, r.Association.Kind)) {
		return fmt.Errorf("待定修改记录缺少身份，已保留原文件。")
	}
	b := p.batch
	if b == nil {
		return nil
	}
	if b.ID == "" || b.Target.Path == "" || len(b.Items) == 0 || len(b.Commands) == 0 || !slices.Contains([]string{"running", "waiting", "paused", "stopped", "completed", "recovered"}, b.State) {
		return fmt.Errorf("批次记录缺少身份或状态，已保留原文件。")
	}
	seen := map[association.Association]bool{}
	for _, item := range b.Items {
		a := item.Selection.Association
		if a.Kind != "file" || a.Key == "" || seen[a] || !slices.Contains([]string{"queued", "waiting", "unknown", "confirmed", "unchanged", "failed", "changed", "unavailable"}, item.Status) {
			return fmt.Errorf("批次项目身份或结果无效，已保留原文件。")
		}
		seen[a] = true
		if item.Status == "waiting" && (item.RequestID == "" || p.pending == nil || p.pending.RequestID != item.RequestID || p.pending.Association != a || p.pending.Target.Path != b.Target.Path) {
			return fmt.Errorf("批次与未定请求记录不一致，已保留原文件。")
		}
	}
	return nil
}

func pairedItem(b *Batch, p *PendingRecord) *BatchItem {
	if b == nil || p == nil || b.Target.Path != p.Target.Path {
		return nil
	}
	item := batchItem(b, p.Association)
	if item == nil || item.RequestID != p.RequestID {
		return nil
	}
	return item
}

func (r changeRecords) load() (recoveredRecords, error) {
	doc, err := r.store.Load(context.Background())
	if err != nil {
		return recoveredRecords{}, err
	}
	pair, err := decodeRecords(doc)
	if err != nil {
		return recoveredRecords{}, err
	}
	out := recoveredRecords{batch: pair.batch}
	if pair.pending != nil {
		pair.pending.Phase = "recovered"
		out.request = &Request{PendingRecord: *pair.pending, Readback: Readback{State: "unknown"}}
		if pairedItem(pair.batch, pair.pending) != nil {
			out.request.BatchID = pair.batch.ID
		}
	}
	if b := out.batch; b != nil {
		for i := range b.Items {
			if b.Items[i].Status == "waiting" {
				b.Items[i].Status, b.Items[i].Message = "unknown", unknownRequestMessage
			}
		}
		if b.State != "completed" {
			b.State = "recovered"
		}
	}
	return out, nil
}

// update is private to the five record actions. Neither callers nor tests need
// to coordinate independent JSON fields or infer the stage of a failed write.
func (r changeRecords) update(apply func(*recordPair) error) error {
	err := r.store.Update(context.Background(), func(doc *config.Document) error {
		pair, err := decodeRecords(*doc)
		if err != nil {
			return err
		}
		if err := apply(&pair); err != nil {
			return err
		}
		if err := pair.validate(); err != nil {
			return err
		}
		doc.Pending, doc.Batch = nil, nil
		if pair.pending != nil {
			doc.Pending, err = json.Marshal(pair.pending)
			if err != nil {
				return err
			}
		}
		if pair.batch != nil {
			doc.Batch, err = json.Marshal(pair.batch)
		}
		return err
	})
	if errors.Is(err, errRecordsUnchanged) {
		return nil
	}
	return err
}

func (r changeRecords) admit(req Request, batch *Batch, evidence recordEvidence) (*Batch, error) {
	var admitted *Batch
	if req.BatchID != "" {
		admitted = clone(batch)
		item := pairedItem(admitted, &req.PendingRecord)
		if item == nil || admitted.ID != req.BatchID || item.Status != "queued" {
			return nil, fmt.Errorf("批次与待受理请求不一致。")
		}
		item.Status, admitted.State = "waiting", "waiting"
		admitted.Revision++
	}
	err := r.update(func(pair *recordPair) error {
		if old := pair.pending; old != nil {
			if !evidence.permitsReplacement(old.RequestID) {
				return fmt.Errorf("仍有需要恢复确认的未定记录，请重新查询旧请求。")
			}
			// A single request can replace uncertainty from a recovered batch.
			// Materialize its recovery projection in the same write, otherwise
			// the old waiting item would point at the new Pending identity.
			if item := pairedItem(pair.batch, old); admitted == nil && item != nil && item.Status == "waiting" {
				item.Status, item.Message = "unknown", unknownRequestMessage
				if pair.batch.State == "waiting" {
					pair.batch.State = "recovered"
				}
			}
		}
		pair.pending = &req.PendingRecord
		if admitted != nil {
			pair.batch = admitted
		}
		return nil
	})
	return admitted, err
}

func (r changeRecords) settle(req *Request, batch *Batch) (*Batch, error) {
	if req == nil || req.Phase != "resolved" || !req.Completion.Known || req.Readback.State != "valid" {
		return nil, nil
	}
	settled := settledBatch(req, batch)
	obsolete := false
	err := r.update(func(pair *recordPair) error {
		if pair.pending != nil && pair.pending.RequestID != req.RequestID {
			obsolete = true
			return errRecordsUnchanged
		}
		if pair.pending == nil && settled == nil {
			return errRecordsUnchanged
		}
		if settled != nil && (pair.batch == nil || pair.batch.ID != settled.ID || pairedItem(pair.batch, &req.PendingRecord) == nil) {
			return fmt.Errorf("批次与待结算请求不一致，已保留原文件。")
		}
		pair.pending = nil
		if settled != nil {
			pair.batch = settled
		}
		return nil
	})
	if obsolete {
		return nil, err
	}
	return settled, err
}

func settledBatch(req *Request, batch *Batch) *Batch {
	if batch == nil || batch.ID != req.BatchID {
		return nil
	}
	b := clone(batch)
	item := pairedItem(b, &req.PendingRecord)
	if item == nil {
		return nil
	}
	item.Status, item.Message = "failed", "系统已返回，但实际默认与目标副本不同。"
	if req.Confirmed {
		item.Status, item.Message = "confirmed", "系统完成且回读匹配目标副本。"
	} else if req.Completion.Error != nil {
		item.Message = req.Completion.Error.Description
	}
	item.Observed = clone(req.Readback.Observation.App)
	if b.State == "waiting" {
		b.State = "running"
	}
	b.Revision++
	return b
}

func (r changeRecords) startBatch(batch *Batch, evidence recordEvidence) error {
	return r.update(func(pair *recordPair) error {
		if p := pair.pending; p != nil {
			if !evidence.permitsReplacement(p.RequestID) {
				return fmt.Errorf("仍有需要恢复确认的未定记录，请重新查询旧请求。")
			}
			if evidence.resolved[p.RequestID] {
				pair.pending = nil
			}
		}
		pair.batch = batch
		return nil
	})
}

func (r changeRecords) saveProgress(batch *Batch, resolved map[string]bool) error {
	return r.update(func(pair *recordPair) error {
		if p := pair.pending; p != nil && resolved[p.RequestID] {
			if item := pairedItem(batch, p); item != nil && (item.Status == "confirmed" || item.Status == "failed") {
				pair.pending = nil
			}
		}
		pair.batch = batch
		return nil
	})
}
