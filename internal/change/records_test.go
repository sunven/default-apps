package change

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/config"
)

func recordInputs() (Request, *Batch) {
	a := association.Association{Kind: "file", Key: "one"}
	app := association.AppCopy{Path: "/Target.app"}
	req := Request{PendingRecord: PendingRecord{RequestID: "request-one", Association: a, Target: app, Phase: "accepted"}, BatchID: "batch-one"}
	batch := &Batch{ID: req.BatchID, Revision: 1, Target: app, State: "running", Commands: []string{"preview-one"}, Items: []BatchItem{{Selection: BatchSelection{Association: a}, RequestID: req.RequestID, Status: "queued"}}}
	return req, batch
}

func recordJSON(t *testing.T, value any) json.RawMessage {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestRecordActionsLeaveDamagedConfigurationUntouched(t *testing.T) {
	cases := map[string]func(*config.Document){
		"pending JSON":     func(d *config.Document) { d.Pending = json.RawMessage(`"broken"`) },
		"pending identity": func(d *config.Document) { d.Pending = json.RawMessage(`{"requestID":"missing-fields"}`) },
		"batch identity":   func(d *config.Document) { d.Batch = json.RawMessage(`{}`) },
		"missing pending":  func(d *config.Document) { d.Pending = nil },
		"other request": func(d *config.Document) {
			req, _ := recordInputs()
			req.RequestID = "another-request"
			d.Pending = recordJSON(t, req.PendingRecord)
		},
		"other association": func(d *config.Document) {
			req, _ := recordInputs()
			req.Association.Key = "two"
			d.Pending = recordJSON(t, req.PendingRecord)
		},
		"other copy": func(d *config.Document) {
			req, _ := recordInputs()
			req.Target.Path = "/Another/Target.app"
			d.Pending = recordJSON(t, req.PendingRecord)
		},
		"two waiting items": func(d *config.Document) {
			_, b := recordInputs()
			b.State, b.Items[0].Status = "waiting", "waiting"
			other := b.Items[0]
			other.Selection.Association.Key = "two"
			b.Items = append(b.Items, other)
			d.Batch = recordJSON(t, b)
		},
		"unknown version": func(d *config.Document) { d.Version = 99 },
	}
	for name, corrupt := range cases {
		t.Run(name, func(t *testing.T) {
			req, batch := recordInputs()
			batch.State, batch.Items[0].Status = "waiting", "waiting"
			doc := config.Document{Version: 2, Pending: recordJSON(t, req.PendingRecord), Batch: recordJSON(t, batch)}
			corrupt(&doc)
			path := filepath.Join(t.TempDir(), "config.json")
			before := recordJSON(t, doc)
			if err := os.WriteFile(path, before, 0600); err != nil {
				t.Fatal(err)
			}
			writes := 0
			records := changeRecords{store: config.NewStoreWithWriter(path, func(path string, data []byte) error {
				writes++
				return config.AtomicWrite(path, data)
			})}
			if loaded, err := records.load(); err == nil || loaded.batch != nil || loaded.request != nil {
				t.Fatal("partial or invalid recovery was published", loaded, err)
			}
			admission, queued := recordInputs()
			resolved := req
			resolved.Phase, resolved.Completion.Known, resolved.Readback.State = "resolved", true, "valid"
			proof := recordEvidence{resolved: map[string]bool{req.RequestID: true}}
			actions := []func() error{
				func() error { _, err := records.admit(admission, queued, proof); return err },
				func() error { _, err := records.settle(&resolved, batch); return err },
				func() error { return records.startBatch(queued, proof) },
				func() error { return records.saveProgress(batch, proof.resolved) },
			}
			for _, action := range actions {
				if err := action(); err == nil {
					t.Fatal("damaged records allowed an update")
				}
			}
			after, err := os.ReadFile(path)
			if err != nil || writes != 0 || !bytes.Equal(before, after) {
				t.Fatal("damaged source was changed", writes, err)
			}
		})
	}
}

func TestRecordActionsRequireMatchingEvidenceAndIgnoreObsoleteSettlement(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	records := changeRecords{store: config.NewStore(path)}
	req, batch := recordInputs()
	if err := records.startBatch(batch, recordEvidence{}); err != nil {
		t.Fatal(err)
	}
	waiting, err := records.admit(req, batch, recordEvidence{})
	if err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(path)
	next := req
	next.RequestID, next.BatchID = "another-request", ""
	wrong := recordEvidence{resolved: map[string]bool{"different-request": true}}
	if _, err := records.admit(next, nil, wrong); err == nil {
		t.Fatal("another request's completion cleared uncertainty")
	}
	if err := records.startBatch(batch, wrong); err == nil {
		t.Fatal("another request's completion allowed a new batch")
	}
	// A progress write cannot leave a waiting item without the right Pending.
	invalid := clone(waiting)
	invalid.Items[0].RequestID = "different-request"
	if err := records.saveProgress(invalid, nil); err == nil {
		t.Fatal("outgoing pair was not validated")
	}
	after, _ := os.ReadFile(path)
	if !bytes.Equal(before, after) {
		t.Fatal("rejected operations changed the file")
	}
	consent := recordEvidence{acknowledged: func(id string) bool { return id == req.RequestID }}
	if _, err := records.admit(next, nil, consent); err != nil {
		t.Fatal(err)
	}
	before, _ = os.ReadFile(path)
	req.Phase, req.Completion.Known, req.Readback.State = "resolved", true, "valid"
	if result, err := records.settle(&req, waiting); err != nil || result != nil {
		t.Fatal("obsolete settlement produced a batch result", result, err)
	}
	after, _ = os.ReadFile(path)
	if !bytes.Equal(before, after) {
		t.Fatal("obsolete settlement overwrote the new request")
	}
	loaded, err := records.load()
	if err != nil || loaded.request.RequestID != next.RequestID || loaded.batch.Items[0].Status != "unknown" {
		t.Fatal(loaded, err)
	}
}

func TestRecordReadsDoNotMigrateOrPersistRecoveryProjection(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	store := config.NewStore(path)
	records := changeRecords{store: store}
	if err := store.Update(context.Background(), func(d *config.Document) error {
		d.Applications = []association.AppCopy{{Path: "/Saved.app"}}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(path)
	if _, err := records.load(); err != nil {
		t.Fatal(err)
	}
	after, _ := os.ReadFile(path)
	if !bytes.Equal(before, after) {
		t.Fatal("reading migrated legacy configuration")
	}
	req, batch := recordInputs()
	if _, err := records.admit(req, batch, recordEvidence{}); err != nil {
		t.Fatal(err)
	}
	before, _ = os.ReadFile(path)
	loaded, err := records.load()
	if err != nil || loaded.batch.State != "recovered" || loaded.batch.Items[0].Status != "unknown" || loaded.request.BatchID != batch.ID {
		t.Fatal(loaded, err)
	}
	after, _ = os.ReadFile(path)
	if !bytes.Equal(before, after) {
		t.Fatal("reading persisted a recovery projection")
	}
	doc, err := store.Load(context.Background())
	if err != nil || doc.Version != 2 || len(doc.Applications) != 1 {
		t.Fatal("batch migration lost manual data", doc, err)
	}
}
