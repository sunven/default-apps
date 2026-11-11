package change

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"slices"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/config"
)

type BatchSelection struct {
	Association association.Association `json:"association"`
	Name        string                  `json:"name"`
	Extensions  []string                `json:"extensions"`
}

type BatchItem struct {
	Selection       BatchSelection       `json:"selection"`
	Expected        ExpectedDefault      `json:"expected"`
	Observed        *association.AppCopy `json:"observed,omitempty"`
	Status          string               `json:"status"`
	Message         string               `json:"message"`
	RequestID       string               `json:"requestID"`
	Attempts        int                  `json:"attempts"`
	PreviousUnknown bool                 `json:"previousUnknown,omitempty"`
}

type Batch struct {
	ID        string              `json:"id"`
	Revision  uint64              `json:"revision"`
	Target    association.AppCopy `json:"target"`
	Items     []BatchItem         `json:"items"`
	State     string              `json:"state"`
	Error     string              `json:"error"`
	CreatedAt string              `json:"createdAt"`
	Commands  []string            `json:"commands"`
	RunItems  []string            `json:"runItems"`
}

// A preview is an immutable, process-local capability. Its ID can start at most
// one confirmed run; a late start after reconciliation cannot write anything.
type BatchPreview struct {
	ID             string              `json:"id"`
	Target         association.AppCopy `json:"target"`
	Items          []BatchItem         `json:"items"`
	BaseBatchID    string              `json:"baseBatchID"`
	BaseRevision   uint64              `json:"baseRevision"`
	ResumeBatchID  string              `json:"resumeBatchID"`
	ReplaceBatchID string              `json:"replaceBatchID"`
}

type BatchResult struct {
	Outcome  string   `json:"outcome"`
	Message  string   `json:"message"`
	Snapshot Snapshot `json:"snapshot"`
}

func (s *Service) batchBlocksLocked() bool {
	b := s.state.Batch
	return b != nil && (b.State == "running" || b.State == "waiting" || b.State == "paused")
}

func unfinishedBatch(b *Batch) bool {
	if b == nil {
		return false
	}
	for _, item := range b.Items {
		if item.Status == "queued" || item.Status == "waiting" || item.Status == "unknown" {
			return true
		}
	}
	return false
}

func batchItem(b *Batch, a association.Association) *BatchItem {
	if b != nil {
		for i := range b.Items {
			if b.Items[i].Selection.Association == a {
				return &b.Items[i]
			}
		}
	}
	return nil
}

func (s *Service) loadBatch(doc config.Document) error {
	if len(doc.Batch) == 0 {
		return nil
	}
	var b Batch
	if err := json.Unmarshal(doc.Batch, &b); err != nil {
		return fmt.Errorf("批次记录损坏，已保留原文件：%w", err)
	}
	if b.ID == "" || b.Target.Path == "" || len(b.Items) == 0 || len(b.Commands) == 0 || !slices.Contains([]string{"running", "waiting", "paused", "stopped", "completed", "recovered"}, b.State) {
		return fmt.Errorf("批次记录缺少身份或状态，已保留原文件。")
	}
	seen := map[association.Association]bool{}
	var pending PendingRecord
	if len(doc.Pending) != 0 {
		if err := json.Unmarshal(doc.Pending, &pending); err != nil {
			return err
		}
	}
	for i := range b.Items {
		item := &b.Items[i]
		a := item.Selection.Association
		if a.Kind != "file" || a.Key == "" || seen[a] || !slices.Contains([]string{"queued", "waiting", "unknown", "confirmed", "unchanged", "failed", "changed", "unavailable"}, item.Status) {
			return fmt.Errorf("批次项目身份或结果无效，已保留原文件。")
		}
		seen[a] = true
		if item.Status == "waiting" {
			if item.RequestID == "" || pending.RequestID != item.RequestID || pending.Association != a || pending.Target.Path != b.Target.Path {
				return fmt.Errorf("批次与未定请求记录不一致，已保留原文件。")
			}
			item.Status, item.Message = "unknown", "上次修改结果未知；当前默认不证明旧请求已结束。"
		}
	}
	if b.State != "completed" {
		b.State = "recovered"
	}
	s.mu.Lock()
	s.state.Batch = &b
	s.state.Version++
	s.mu.Unlock()
	return nil
}

// PrepareBatch only reads. Item order is the order shown in the resulting preview.
func (s *Service) PrepareBatch(ctx context.Context, selections []BatchSelection, targetPath, resumeBatchID string) (BatchPreview, error) {
	if err := s.ensureLoaded(); err != nil {
		return BatchPreview{}, err
	}
	if err := s.refreshBatchRecovery(); err != nil {
		return BatchPreview{}, err
	}
	s.mu.Lock()
	base := clone(s.state.Batch)
	s.mu.Unlock()
	if resumeBatchID != "" && (base == nil || base.ID != resumeBatchID) {
		return BatchPreview{}, fmt.Errorf("原批次已变化，请查看最近一批。")
	}
	target, err := s.reader.ReadApplicationCopy(ctx, targetPath)
	if err != nil {
		return BatchPreview{}, err
	}
	if !target.Usable() || target.Path != targetPath {
		return BatchPreview{}, fmt.Errorf("目标应用副本不可用，请重新选择。")
	}
	p := BatchPreview{ID: rand.Text(), Target: target, Items: []BatchItem{}}
	if base != nil {
		p.BaseBatchID, p.BaseRevision = base.ID, base.Revision
		if resumeBatchID != "" && base.Target.Path == target.Path {
			p.ResumeBatchID = base.ID
		}
		if p.ResumeBatchID == "" && unfinishedBatch(base) {
			p.ReplaceBatchID = base.ID
		}
	}
	seen := map[association.Association]bool{}
	for _, selected := range selections {
		if err := ctx.Err(); err != nil {
			return BatchPreview{}, err
		}
		a := selected.Association
		if seen[a] {
			continue
		}
		seen[a] = true
		if a.Kind != "file" || a.Key == "" {
			return BatchPreview{}, fmt.Errorf("批量设置只接受具体文件类型。")
		}
		if resumeBatchID != "" {
			previous := batchItem(base, a)
			if previous == nil || previous.Status == "confirmed" || previous.Status == "unchanged" {
				return BatchPreview{}, fmt.Errorf("继续或重试只能选择原批次中尚待处理的项目。")
			}
		}
		item := BatchItem{Selection: selected, Status: "unavailable"}
		entries, resolveErr := s.catalog.Resolve(ctx, []catalog.Input{{Kind: "identifier", Value: a.Key}})
		resolved := slices.ContainsFunc(entries, func(e catalog.Entry) bool { return e.Resolved && e.Association == a })
		if resolveErr != nil || !resolved {
			item.Message = "类型暂时无法解析，本次不执行。"
		} else {
			q, queryErr := s.Query(ctx, a)
			if queryErr != nil || q.Superseded || !q.Default.Trustworthy() {
				item.Message = "无法检查当前默认，本次不执行；请重新查询后预览。"
			} else {
				item.Observed = clone(q.Default.App)
				item.Expected = ExpectedDefault{Known: true, Path: appPath(q.Default.App)}
				item.Status = "queued"
				if item.Expected.Path == target.Path {
					item.Status, item.Message = "unchanged", "已是目标应用，无需修改。"
				}
			}
		}
		p.Items = append(p.Items, item)
	}
	if len(p.Items) == 0 {
		return BatchPreview{}, fmt.Errorf("请先选择文件类型。")
	}
	s.batchMu.Lock()
	defer s.batchMu.Unlock()
	if s.previews == nil {
		s.previews = map[string]BatchPreview{}
	}
	// Old, unused previews are expendable; started commands live in the batch.
	if len(s.previews) >= 32 {
		for id := range s.previews {
			delete(s.previews, id)
			break
		}
	}
	s.previews[p.ID] = clone(p)
	return p, nil
}

func (s *Service) batchResult(outcome, message string) BatchResult {
	return BatchResult{Outcome: outcome, Message: message, Snapshot: s.GetSnapshot()}
}

// A failed fsync can leave an accepted record on disk even though no setter was
// dispatched. Bring that evidence into the ordinary recovery flow before retry.
func (s *Service) refreshBatchRecovery() error {
	s.batchMu.Lock()
	defer s.batchMu.Unlock()
	s.mu.Lock()
	needed := s.state.Batch != nil && s.state.Batch.Error != "" && !s.state.Busy && s.state.ActiveRequestID == "" && s.state.Recovery == nil
	s.mu.Unlock()
	if !needed {
		return nil
	}
	doc, err := s.store.Load(context.Background())
	if err != nil {
		return err
	}
	if len(doc.Pending) == 0 {
		return nil
	}
	var pending PendingRecord
	if err := json.Unmarshal(doc.Pending, &pending); err != nil {
		return err
	}
	s.mu.Lock()
	if r := s.findRequestLocked(pending.RequestID); r != nil && r.Phase == "resolved" {
		s.mu.Unlock()
		return nil
	}
	pending.Phase = "recovered"
	if s.findRequestLocked(pending.RequestID) == nil {
		s.state.Requests = append(s.state.Requests, Request{PendingRecord: pending, Readback: Readback{State: "unknown"}})
	}
	s.state.Recovery = &Recovery{Record: pending}
	s.state.Busy = true
	v := s.changedLocked()
	s.mu.Unlock()
	s.publish(v)
	return nil
}

func (s *Service) StartBatch(previewID, replaceBatchID, recoveryRequestID string) BatchResult {
	if err := s.ensureLoaded(); err != nil {
		return s.batchResult("storage_error", err.Error())
	}
	s.batchMu.Lock()
	defer s.batchMu.Unlock()
	s.mu.Lock()
	base := clone(s.state.Batch)
	if base != nil && slices.Contains(base.Commands, previewID) {
		s.mu.Unlock()
		return s.batchResult("existing", "已找到这次批量设置。")
	}
	s.mu.Unlock()
	p, ok := s.previews[previewID]
	if !ok {
		return s.batchResult("expired", "预览已失效或原提交未被受理，请重新预览。")
	}
	if (base == nil && p.BaseBatchID != "") || (base != nil && (p.BaseBatchID != base.ID || p.BaseRevision != base.Revision)) {
		return s.batchResult("changed", "最近批次已变化，请重新预览。")
	}
	if p.ReplaceBatchID != "" && replaceBatchID != p.ReplaceBatchID {
		return s.batchResult("replace_required", "请先确认放弃旧批次的后续设置。")
	}
	if !slices.ContainsFunc(p.Items, func(i BatchItem) bool { return i.Status == "queued" }) {
		return s.batchResult("empty", "没有需要执行的项目。")
	}
	s.mu.Lock()
	if s.state.Busy || s.admitting != nil || s.state.Quit.Exiting || s.state.Quit.Restarting || s.state.Quit.Prompt || (s.batchBlocksLocked() && base.State != "paused") {
		s.mu.Unlock()
		return s.batchResult("busy", "请先结束当前修改或停止后续设置。")
	}
	if recovery := s.state.Recovery; recovery != nil && (!recovery.Ready || recoveryRequestID != recovery.Record.RequestID) {
		s.mu.Unlock()
		return s.batchResult("recovery_required", "请先查询旧请求，并确认它仍可能完成。")
	}
	// Reserve admission while the initial batch document is being saved.
	s.state.Busy = true
	s.mu.Unlock()
	b := &Batch{ID: rand.Text(), Revision: 1, Target: p.Target, Items: clone(p.Items), State: "running", CreatedAt: now(), Commands: []string{p.ID}}
	if p.ResumeBatchID != "" {
		b = clone(base)
		b.State, b.Error = "running", ""
		b.Revision++
		b.Commands = append(b.Commands, p.ID)
		for _, item := range p.Items {
			previous := batchItem(b, item.Selection.Association)
			item.Attempts = previous.Attempts
			item.PreviousUnknown = previous.PreviousUnknown || previous.Status == "unknown"
			*previous = item
		}
	}
	b.RunItems = nil
	for _, item := range p.Items {
		if item.Status == "queued" {
			b.RunItems = append(b.RunItems, item.Selection.Association.Key)
		}
	}
	err := s.store.Update(context.Background(), func(doc *config.Document) error {
		// A known completion whose previous save failed can be committed here
		// with the resumed batch. An unknown pending request is preserved.
		if len(doc.Pending) != 0 {
			var pending PendingRecord
			if err := json.Unmarshal(doc.Pending, &pending); err != nil {
				return err
			}
			s.mu.Lock()
			r := s.findRequestLocked(pending.RequestID)
			resolved := r != nil && r.Phase == "resolved"
			acknowledged := s.state.Recovery != nil && s.state.Recovery.Record.RequestID == pending.RequestID && s.state.Recovery.Ready && recoveryRequestID == pending.RequestID
			s.mu.Unlock()
			if resolved {
				doc.Pending = nil
			} else if !acknowledged {
				return fmt.Errorf("仍有需要恢复确认的未定记录，请重新打开后查询旧请求。")
			}
		}
		var err error
		doc.Batch, err = json.Marshal(b)
		return err
	})
	s.mu.Lock()
	s.state.Busy = false
	if err != nil {
		b.State, b.Error = "paused", "保存批次失败，尚未开始后续设置："+err.Error()
	}
	s.state.Batch = b
	s.batchRecoveryID = recoveryRequestID
	v := s.changedLocked()
	s.mu.Unlock()
	delete(s.previews, previewID)
	s.publish(v)
	if err != nil {
		return s.batchResult("storage_error", b.Error)
	}
	s.kickBatch()
	return BatchResult{Outcome: "accepted", Snapshot: v}
}

// Reconciliation closes an unused capability before returning. A binding call
// arriving after this read-only recovery endpoint cannot start the batch.
func (s *Service) ReconcileBatchStart(previewID string) BatchResult {
	_ = s.ensureLoaded()
	s.batchMu.Lock()
	defer s.batchMu.Unlock()
	s.mu.Lock()
	found := s.state.Batch != nil && slices.Contains(s.state.Batch.Commands, previewID)
	s.mu.Unlock()
	if found {
		return s.batchResult("existing", "已找到原批量设置。")
	}
	delete(s.previews, previewID)
	return s.batchResult("closed", "最近批次中未找到原操作，迟到的开始操作不会执行。请查看最近批次后重新预览。")
}

func (s *Service) StopBatch(batchID string) BatchResult {
	if err := s.ensureLoaded(); err != nil {
		return s.batchResult("storage_error", err.Error())
	}
	s.batchMu.Lock()
	defer s.batchMu.Unlock()
	s.mu.Lock()
	b := clone(s.state.Batch)
	if b == nil || b.ID != batchID {
		s.mu.Unlock()
		return s.batchResult("changed", "最近批次已变化。")
	}
	b.State, b.Error = "stopped", ""
	b.Revision++
	// Stop takes effect in memory even if writing its durable record fails.
	s.state.Batch = b
	s.mu.Unlock()
	err := s.saveBatch(b)
	s.mu.Lock()
	if err != nil {
		s.state.Batch.State = "paused"
		s.state.Batch.Error = "后续设置已停止，但保存进度失败：" + err.Error()
	}
	v := s.changedLocked()
	s.mu.Unlock()
	s.publish(v)
	if err != nil {
		return BatchResult{Outcome: "storage_error", Message: v.Batch.Error, Snapshot: v}
	}
	return BatchResult{Outcome: "stopped", Snapshot: v}
}

func (s *Service) saveBatch(b *Batch) error {
	return s.store.Update(context.Background(), func(doc *config.Document) error {
		if len(doc.Pending) != 0 {
			var p PendingRecord
			if err := json.Unmarshal(doc.Pending, &p); err != nil {
				return err
			}
			if item := batchItem(b, p.Association); item != nil && item.RequestID == p.RequestID && (item.Status == "confirmed" || item.Status == "failed") {
				s.mu.Lock()
				r := s.findRequestLocked(p.RequestID)
				resolved := r != nil && r.Phase == "resolved"
				s.mu.Unlock()
				if resolved {
					doc.Pending = nil
				}
			}
		}
		var err error
		doc.Batch, err = json.Marshal(b)
		return err
	})
}

func (s *Service) kickBatch() { go s.advanceBatch() }

func (s *Service) advanceBatch() {
	s.batchMu.Lock()
	defer s.batchMu.Unlock()
	for {
		s.mu.Lock()
		b := s.state.Batch
		if b == nil || b.State != "running" || s.state.Busy || s.state.Quit.Exiting || s.state.Quit.Restarting || s.state.Quit.Prompt {
			s.mu.Unlock()
			return
		}
		index := -1
		for _, key := range b.RunItems {
			index = slices.IndexFunc(b.Items, func(i BatchItem) bool { return i.Status == "queued" && i.Selection.Association.Key == key })
			if index >= 0 {
				break
			}
		}
		if index < 0 {
			b = clone(b)
			b.State = "completed"
			if unfinishedBatch(b) {
				b.State = "stopped"
			}
			b.Revision++
			s.mu.Unlock()
			s.commitBatchProgress(b)
			return
		}
		b.Items[index].RequestID = rand.Text()
		b.Items[index].Attempts++
		item, id, targetPath, recoveryID := clone(b.Items[index]), b.ID, b.Target.Path, s.batchRecoveryID
		s.mu.Unlock()
		result := s.submit(context.Background(), Submission{RequestID: item.RequestID, Association: item.Selection.Association, TargetPath: targetPath, Expected: item.Expected, RecoveryRequestID: recoveryID}, id)
		if result.Outcome == "accepted" || result.Outcome == "existing" {
			return
		}
		s.mu.Lock()
		b = clone(s.state.Batch)
		if b == nil || b.ID != id {
			s.mu.Unlock()
			return
		}
		current := &b.Items[index]
		current.Message = result.Message
		if result.Observation != nil {
			current.Observed = clone(result.Observation.App)
		}
		switch result.Outcome {
		case "no_change":
			current.Status = "unchanged"
		case "changed":
			current.Status = "changed"
		case "target_unavailable", "recovery_query_required", "recovery_ack_required", "busy":
			current.Status, b.State, b.Error = "queued", "paused", result.Message
		case "storage_error":
			// A rename may have committed the pending record even on error.
			// Never overwrite that evidence with a fresh queued batch document.
			current.Status, b.State, b.Error = "unknown", "paused", result.Message
		case "exiting":
			s.mu.Unlock()
			return
		default:
			current.Status = "failed"
		}
		b.Revision++
		s.mu.Unlock()
		if result.Outcome == "storage_error" {
			s.mu.Lock()
			s.state.Batch = b
			v := s.changedLocked()
			s.mu.Unlock()
			s.publish(v)
			return
		}
		if s.commitBatchProgress(b) && b.State == "running" {
			s.kickBatch()
		}
		return
	}
}

// Called with batchMu held. No next item is admitted until this write succeeds.
func (s *Service) commitBatchProgress(b *Batch) bool {
	err := s.saveBatch(b)
	s.mu.Lock()
	if err != nil {
		b.State, b.Error = "paused", "保存进度失败："+err.Error()
	}
	s.state.Batch = b
	v := s.changedLocked()
	s.mu.Unlock()
	s.publish(v)
	return err == nil
}

// Called with both locks held before clearing the matching pending record.
func (s *Service) settledBatchLocked(requestID string) *Batch {
	r := s.findRequestLocked(requestID)
	if r == nil || r.Phase != "resolved" || s.state.Batch == nil {
		return nil
	}
	b := clone(s.state.Batch)
	for i := range b.Items {
		item := &b.Items[i]
		if item.RequestID != requestID {
			continue
		}
		item.Status, item.Message = "failed", "系统已返回，但实际默认与目标副本不同。"
		if r.Confirmed {
			item.Status, item.Message = "confirmed", "系统完成且回读匹配目标副本。"
		} else if r.Completion.Error != nil {
			item.Message = r.Completion.Error.Description
		}
		item.Observed = clone(r.Readback.Observation.App)
		if b.State == "waiting" {
			b.State = "running"
		}
		b.Revision++
		return b
	}
	return nil
}
