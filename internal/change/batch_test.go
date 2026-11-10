package change_test

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/change"
	"github.com/sunven/default-apps/internal/config"
)

type batchCall struct {
	a      association.Association
	target association.AppCopy
	finish func(*change.NativeError)
	doc    config.Document
}
type batchSystem struct {
	system
	values map[string]*association.AppCopy
	calls  chan batchCall
}

func (s *batchSystem) CurrentDefault(_ context.Context, a association.Association) (*association.AppCopy, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.queryErr != nil {
		return nil, s.queryErr
	}
	if v, ok := s.values[a.Key]; ok {
		if v == nil {
			return nil, nil
		}
		copy := *v
		return &copy, nil
	}
	copy := old
	return &copy, nil
}
func (s *batchSystem) Dispatch(a association.Association, app association.AppCopy, submitted func(), complete func(*change.NativeError)) {
	doc, _ := s.store.Load(ctx)
	s.mu.Lock()
	s.starts++
	s.mu.Unlock()
	submitted()
	s.calls <- batchCall{a, app, complete, doc}
}
func (s *batchSystem) set(key string, app *association.AppCopy) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.values[key] = app
}
func (s *batchSystem) complete(call batchCall, success bool) {
	if success {
		s.set(call.a.Key, &call.target)
		call.finish(nil)
	} else {
		call.finish(&change.NativeError{Domain: "test", Code: 1, Description: "refused"})
	}
}
func newBatchService(sys *batchSystem, store config.Repository) *change.Service {
	return change.NewService(catalog.NewService(sys), association.NewService(sys), sys, store, sys, change.Options{WritableKinds: []string{"file"}})
}
func batchFixture(t *testing.T, writer config.AtomicWriter) (*change.Service, *batchSystem, *config.Store) {
	t.Helper()
	store := config.NewStore(filepath.Join(t.TempDir(), "config.json"))
	if writer != nil {
		store = config.NewStoreWithWriter(filepath.Join(t.TempDir(), "config.json"), writer)
	}
	sys := &batchSystem{system: system{store: store}, values: map[string]*association.AppCopy{}, calls: make(chan batchCall, 20)}
	return newBatchService(sys, store), sys, store
}
func selections(keys ...string) []change.BatchSelection {
	var result []change.BatchSelection
	for _, key := range keys {
		result = append(result, change.BatchSelection{Association: association.Association{Kind: "file", Key: key}, Name: key, Extensions: []string{key}})
	}
	return result
}
func prepareBatch(t *testing.T, svc *change.Service, items []change.BatchSelection, path, resume string) change.BatchPreview {
	t.Helper()
	p, err := svc.PrepareBatch(ctx, items, path, resume)
	if err != nil {
		t.Fatal(err)
	}
	return p
}
func nextBatchCall(t *testing.T, sys *batchSystem, key string) batchCall {
	t.Helper()
	select {
	case call := <-sys.calls:
		if call.a.Key != key {
			t.Fatalf("expected %s, dispatched %s", key, call.a.Key)
		}
		var b change.Batch
		var pending change.PendingRecord
		if err := json.Unmarshal(call.doc.Batch, &b); err != nil {
			t.Fatal(err)
		}
		if err := json.Unmarshal(call.doc.Pending, &pending); err != nil {
			t.Fatal(err)
		}
		found := false
		for _, item := range b.Items {
			if item.RequestID == pending.RequestID && item.Selection.Association == call.a && item.Status == "waiting" {
				found = true
			}
		}
		if !found || b.Target.Path != call.target.Path {
			t.Fatalf("setter ran without matching durable batch and request: %+v", call.doc)
		}
		return call
	case <-time.After(time.Second):
		t.Fatal("batch setter did not start")
		return batchCall{}
	}
}
func noBatchCall(t *testing.T, sys *batchSystem) {
	t.Helper()
	select {
	case call := <-sys.calls:
		t.Fatalf("unexpected setter: %s", call.a.Key)
	case <-time.After(30 * time.Millisecond):
	}
}

func TestBatchSerialPartialResultsAndExternalChange(t *testing.T) {
	svc, sys, store := batchFixture(t, nil)
	sys.set("same", &target)
	p := prepareBatch(t, svc, selections("one", "same", "changed", "refused", "last"), target.Path, "")
	sys.set("changed", &association.AppCopy{Path: "/Applications/External.app"})
	if got := svc.StartBatch(p.ID, "", ""); got.Outcome != "accepted" {
		t.Fatal(got)
	}
	first := nextBatchCall(t, sys, "one")
	if got := svc.StartBatch(p.ID, "", ""); got.Outcome != "existing" {
		t.Fatal(got)
	}
	if got := svc.Submit(ctx, input("intruder")); got.Outcome != "busy" {
		t.Fatal("single write entered batch", got)
	}
	sys.set("one", &target)
	_, _ = svc.Query(ctx, first.a)
	noBatchCall(t, sys) // an early query matching the target is not completion
	sys.complete(first, true)
	second := nextBatchCall(t, sys, "refused")
	sys.complete(second, false)
	last := nextBatchCall(t, sys, "last")
	sys.complete(last, true)
	v := waitState(t, svc, func(v change.Snapshot) bool { return v.Batch != nil && v.Batch.State == "completed" })
	want := []string{"confirmed", "unchanged", "changed", "failed", "confirmed"}
	for i, item := range v.Batch.Items {
		if item.Status != want[i] {
			t.Fatalf("item %d: %+v", i, item)
		}
	}
	if v.BatchBlocked || v.Busy {
		t.Fatal("completed batch kept write lock")
	}
	doc, _ := store.Load(ctx)
	if len(doc.Pending) != 0 || doc.Version != 2 {
		t.Fatalf("completion was not persisted atomically: %+v", doc)
	}
	var saved change.Batch
	_ = json.Unmarshal(doc.Batch, &saved)
	if saved.Items[4].Status != "confirmed" {
		t.Fatal(saved)
	}
}

func TestBatchStopAndExplicitResumeDoesNotRepeatSuccess(t *testing.T) {
	svc, sys, _ := batchFixture(t, nil)
	p := prepareBatch(t, svc, selections("one", "two"), target.Path, "")
	started := svc.StartBatch(p.ID, "", "")
	first := nextBatchCall(t, sys, "one")
	if got := svc.StopBatch(started.Snapshot.Batch.ID); got.Outcome != "stopped" {
		t.Fatal(got)
	}
	sys.complete(first, true)
	waitState(t, svc, func(v change.Snapshot) bool { return !v.Busy && v.Batch.Items[0].Status == "confirmed" })
	noBatchCall(t, sys)
	p = prepareBatch(t, svc, selections("two"), target.Path, started.Snapshot.Batch.ID)
	if got := svc.StartBatch(p.ID, "", ""); got.Outcome != "accepted" {
		t.Fatal(got)
	}
	second := nextBatchCall(t, sys, "two")
	sys.complete(second, true)
	v := waitState(t, svc, func(v change.Snapshot) bool { return v.Batch.State == "completed" })
	if v.Batch.ID != started.Snapshot.Batch.ID || v.Batch.Items[0].Attempts != 1 || v.Batch.Items[1].Attempts != 1 {
		t.Fatal(v.Batch)
	}
}

func TestBatchReopenRetainsUnknownAndNeverAutomaticallyContinues(t *testing.T) {
	svc, sys, store := batchFixture(t, nil)
	p := prepareBatch(t, svc, selections("one", "two"), target.Path, "")
	started := svc.StartBatch(p.ID, "", "")
	first := nextBatchCall(t, sys, "one")
	if svc.RequestQuit() {
		t.Fatal("pending batch quit without prompt")
	}
	svc.RespondQuit(svc.GetSnapshot().Quit.PromptID, true)
	reopened := newBatchService(sys, store)
	v := reopened.GetSnapshot()
	if v.Batch.State != "recovered" || v.Batch.Items[0].Status != "unknown" || v.Batch.Items[1].Status != "queued" {
		t.Fatal(v.Batch)
	}
	noBatchCall(t, sys)
	sys.set("one", &target)
	_, _ = reopened.Query(ctx, first.a)
	if reopened.GetSnapshot().Batch.Items[0].Status != "unknown" {
		t.Fatal("current value invented old success")
	}
	p = prepareBatch(t, reopened, selections("two"), target.Path, started.Snapshot.Batch.ID)
	if got := reopened.StartBatch(p.ID, "", ""); got.Outcome != "recovery_required" {
		t.Fatal(got)
	}
	if got := reopened.StartBatch(p.ID, "", v.Recovery.Record.RequestID); got.Outcome != "accepted" {
		t.Fatal(got)
	}
	second := nextBatchCall(t, sys, "two")
	sys.complete(second, true)
	waitState(t, reopened, func(v change.Snapshot) bool { return !v.Busy && v.Batch.Items[1].Status == "confirmed" })
	noBatchCall(t, sys)
}

func TestBatchReconcileClosesLateStartAndTargetChangeUsesNewBatch(t *testing.T) {
	svc, sys, _ := batchFixture(t, nil)
	p := prepareBatch(t, svc, selections("one", "two"), target.Path, "")
	if got := svc.ReconcileBatchStart(p.ID); got.Outcome != "closed" {
		t.Fatal(got)
	}
	if got := svc.StartBatch(p.ID, "", ""); got.Outcome != "expired" {
		t.Fatal(got)
	}
	noBatchCall(t, sys)
	p = prepareBatch(t, svc, selections("one", "two"), target.Path, "")
	started := svc.StartBatch(p.ID, "", "")
	first := nextBatchCall(t, sys, "one")
	svc.StopBatch(started.Snapshot.Batch.ID)
	sys.complete(first, true)
	waitState(t, svc, func(v change.Snapshot) bool { return !v.Busy })
	p = prepareBatch(t, svc, selections("two"), "/Applications/Other.app", started.Snapshot.Batch.ID)
	if p.ResumeBatchID != "" || p.ReplaceBatchID != started.Snapshot.Batch.ID {
		t.Fatal(p)
	}
	if got := svc.StartBatch(p.ID, "", ""); got.Outcome != "replace_required" {
		t.Fatal(got)
	}
	got := svc.StartBatch(p.ID, p.ReplaceBatchID, "")
	if got.Outcome != "accepted" || got.Snapshot.Batch.ID == started.Snapshot.Batch.ID || len(got.Snapshot.Batch.Items) != 1 {
		t.Fatal(got)
	}
	last := nextBatchCall(t, sys, "two")
	sys.complete(last, true)
	waitState(t, svc, func(v change.Snapshot) bool { return v.Batch.State == "completed" })
}

func TestBatchAdmissionStorageFailurePreservesUncertainty(t *testing.T) {
	for _, afterRename := range []bool{false, true} {
		t.Run(fmt.Sprint(afterRename), func(t *testing.T) {
			writer := func(path string, data []byte) error {
				var d config.Document
				_ = json.Unmarshal(data, &d)
				if len(d.Pending) != 0 {
					if afterRename {
						if err := config.AtomicWrite(path, data); err != nil {
							return err
						}
					}
					return fmt.Errorf("simulated persistence failure")
				}
				return config.AtomicWrite(path, data)
			}
			svc, sys, store := batchFixture(t, writer)
			p := prepareBatch(t, svc, selections("one", "two"), target.Path, "")
			svc.StartBatch(p.ID, "", "")
			waitState(t, svc, func(v change.Snapshot) bool { return v.Batch.State == "paused" })
			noBatchCall(t, sys)
			reopened := newBatchService(sys, store)
			v := reopened.GetSnapshot()
			if v.StorageError != nil {
				t.Fatal(v.StorageError)
			}
			want := "queued"
			if afterRename {
				want = "unknown"
			}
			if v.Batch.Items[0].Status != want {
				t.Fatalf("want %s, got %+v", want, v.Batch)
			}
			noBatchCall(t, sys)
		})
	}
}

func TestBatchResultStorageFailureStopsNextAndSurvivesReopen(t *testing.T) {
	for _, afterRename := range []bool{false, true} {
		t.Run(fmt.Sprint(afterRename), func(t *testing.T) {
			writer := func(path string, data []byte) error {
				var d config.Document
				_ = json.Unmarshal(data, &d)
				var b change.Batch
				_ = json.Unmarshal(d.Batch, &b)
				if len(b.Items) > 0 && b.Items[0].Status == "confirmed" {
					if afterRename {
						if err := config.AtomicWrite(path, data); err != nil {
							return err
						}
					}
					return fmt.Errorf("simulated result save failure")
				}
				return config.AtomicWrite(path, data)
			}
			svc, sys, store := batchFixture(t, writer)
			p := prepareBatch(t, svc, selections("one", "two"), target.Path, "")
			svc.StartBatch(p.ID, "", "")
			first := nextBatchCall(t, sys, "one")
			sys.complete(first, true)
			waitState(t, svc, func(v change.Snapshot) bool { return !v.Busy && v.Batch.State == "paused" })
			noBatchCall(t, sys)
			v := newBatchService(sys, store).GetSnapshot()
			want := "unknown"
			if afterRename {
				want = "confirmed"
			}
			if v.Batch == nil || v.Batch.Items[0].Status != want {
				t.Fatalf("want %s: %+v", want, v)
			}
			noBatchCall(t, sys)
		})
	}
}

func TestBatchRetryAfterRenameErrorRecoversDiskEvidenceInSameProcess(t *testing.T) {
	var fail atomic.Bool
	fail.Store(true)
	writer := func(path string, data []byte) error {
		if err := config.AtomicWrite(path, data); err != nil {
			return err
		}
		var doc config.Document
		_ = json.Unmarshal(data, &doc)
		if len(doc.Pending) != 0 && fail.Load() {
			return fmt.Errorf("directory sync failed after rename")
		}
		return nil
	}
	svc, sys, _ := batchFixture(t, writer)
	p := prepareBatch(t, svc, selections("one", "two"), target.Path, "")
	started := svc.StartBatch(p.ID, "", "")
	waitState(t, svc, func(v change.Snapshot) bool { return v.Batch.State == "paused" })
	noBatchCall(t, sys)
	fail.Store(false)
	p = prepareBatch(t, svc, selections("one", "two"), target.Path, started.Snapshot.Batch.ID)
	v := svc.GetSnapshot()
	if v.Recovery == nil || !v.Recovery.Ready {
		t.Fatal("saved uncertainty was not brought into recovery", v)
	}
	if got := svc.StartBatch(p.ID, "", ""); got.Outcome != "recovery_required" {
		t.Fatal(got)
	}
	if got := svc.StartBatch(p.ID, "", v.Recovery.Record.RequestID); got.Outcome != "accepted" {
		t.Fatal(got)
	}
	first := nextBatchCall(t, sys, "one")
	sys.complete(first, true)
	second := nextBatchCall(t, sys, "two")
	sys.complete(second, true)
	finished := waitState(t, svc, func(v change.Snapshot) bool { return v.Batch.State == "completed" })
	if !finished.Batch.Items[0].PreviousUnknown {
		t.Fatal("old uncertainty was silently discarded")
	}
}

func TestBatchContinuesAfterDecliningRestartWhosePromptOutlivesCurrentItem(t *testing.T) {
	svc, sys, _ := batchFixture(t, nil)
	p := prepareBatch(t, svc, selections("one", "two"), target.Path, "")
	svc.StartBatch(p.ID, "", "")
	first := nextBatchCall(t, sys, "one")
	var restarted atomic.Bool
	if err := change.PrepareRestart(svc, func() { restarted.Store(true) }); err != nil {
		t.Fatal(err)
	}
	prompt := svc.GetSnapshot().Quit
	sys.complete(first, true)
	waitState(t, svc, func(v change.Snapshot) bool { return !v.Busy && v.Batch.Items[0].Status == "confirmed" })
	noBatchCall(t, sys)
	svc.RespondQuit(prompt.PromptID, false)
	second := nextBatchCall(t, sys, "two")
	sys.complete(second, true)
	waitState(t, svc, func(v change.Snapshot) bool { return v.Batch.State == "completed" })
	if restarted.Load() {
		t.Fatal("declining restart ran installation")
	}
}
