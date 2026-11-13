package change_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"sync/atomic"
	"testing"
	"time"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/change"
	"github.com/sunven/default-apps/internal/config"
)

func nextSingleCall(t *testing.T, sys *batchSystem, id string) batchCall {
	t.Helper()
	select {
	case call := <-sys.calls:
		var pending change.PendingRecord
		if err := json.Unmarshal(call.doc.Pending, &pending); err != nil || pending.RequestID != id {
			t.Fatalf("single request was not durable before dispatch: %+v %v", pending, err)
		}
		return call
	case <-time.After(time.Second):
		t.Fatal("single setter did not start")
		return batchCall{}
	}
}

func TestRecoveredBatchSurvivesExplicitSingleReplacement(t *testing.T) {
	svc, sys, store := batchFixture(t, nil)
	p := prepareBatch(t, svc, selections("one", "two"), target.Path, "")
	svc.StartBatch(p.ID, "", "")
	first := nextBatchCall(t, sys, "one")
	reopened := newBatchService(sys, store)
	recovered, err := reopened.Requery(ctx, first.a)
	if err != nil || recovered.Recovery == nil || !recovered.Recovery.Ready {
		t.Fatal(recovered, err)
	}
	oldID := recovered.Recovery.Record.RequestID
	next := input("explicit-single-replacement")
	next.RecoveryRequestID = oldID
	if got := reopened.Submit(ctx, next); got.Outcome != "accepted" {
		t.Fatal(got)
	}
	call := nextSingleCall(t, sys, next.RequestID)
	check := func(t *testing.T, pending bool) {
		t.Helper()
		v := newBatchService(sys, store).GetSnapshot()
		if v.StorageError != nil || v.Batch == nil {
			t.Fatalf("replacement damaged the saved pair: %+v", v)
		}
		item := v.Batch.Items[0]
		if item.Status != "unknown" || item.RequestID != oldID || v.Batch.Items[1].Status != "queued" {
			t.Fatalf("old uncertainty lost: %+v", v.Batch)
		}
		if (v.Recovery != nil) != pending || (pending && v.Recovery.Record.RequestID != next.RequestID) {
			t.Fatalf("incorrect replacement recovery: %+v", v)
		}
		noBatchCall(t, sys)
	}
	t.Run("while replacement waits", func(t *testing.T) { check(t, true) })
	sys.complete(call, true)
	waitState(t, reopened, func(v change.Snapshot) bool { return !v.Busy })
	t.Run("after replacement completes", func(t *testing.T) { check(t, false) })
}

func TestStopAfterAdmissionSaveErrorStillDiscoversRecoveryBeforeResume(t *testing.T) {
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
	svc.StartBatch(p.ID, "", "")
	v := waitState(t, svc, func(v change.Snapshot) bool { return v.Batch.State == "paused" })
	noBatchCall(t, sys)
	fail.Store(false)
	if got := svc.StopBatch(v.Batch.ID); got.Outcome != "stopped" || got.Snapshot.Batch.Error != "" {
		t.Fatal(got)
	}
	p = prepareBatch(t, svc, selections("one", "two"), target.Path, v.Batch.ID)
	v = svc.GetSnapshot()
	if v.Recovery == nil || !v.Recovery.Ready {
		t.Fatal("stopping hid the durable pending request", v)
	}
	if got := svc.StartBatch(p.ID, "", ""); got.Outcome != "recovery_required" {
		t.Fatal(got)
	}
	if got := svc.StartBatch(p.ID, "", v.Recovery.Record.RequestID); got.Outcome != "accepted" {
		t.Fatal(got)
	}
	sys.complete(nextBatchCall(t, sys, "one"), true)
	sys.complete(nextBatchCall(t, sys, "two"), true)
	waitState(t, svc, func(v change.Snapshot) bool { return v.Batch.State == "completed" })
}

func TestRecoveredBatchSingleReplacementSaveFailuresPreserveEvidence(t *testing.T) {
	for _, afterRename := range []bool{false, true} {
		t.Run(fmt.Sprintf("afterRename=%t", afterRename), func(t *testing.T) {
			var fail atomic.Bool
			writer := func(path string, data []byte) error {
				if fail.Load() {
					if afterRename {
						if err := config.AtomicWrite(path, data); err != nil {
							return err
						}
					}
					return fmt.Errorf("replacement save failed")
				}
				return config.AtomicWrite(path, data)
			}
			svc, sys, store := batchFixture(t, writer)
			if err := store.Update(ctx, func(doc *config.Document) error {
				doc.Applications = []association.AppCopy{old}
				doc.Associations = []config.ManualAssociation{{Input: catalog.Input{Kind: "scheme", Value: "saved", Source: "manual"}, SelectedID: "scheme:saved"}}
				return nil
			}); err != nil {
				t.Fatal(err)
			}
			p := prepareBatch(t, svc, selections("one", "two"), target.Path, "")
			svc.StartBatch(p.ID, "", "")
			first := nextBatchCall(t, sys, "one")
			reopened := newBatchService(sys, store)
			v, err := reopened.Requery(ctx, first.a)
			if err != nil || v.Recovery == nil || !v.Recovery.Ready {
				t.Fatal(v, err)
			}
			oldID := v.Recovery.Record.RequestID
			next := input("failed-replacement")
			next.RecoveryRequestID = oldID
			fail.Store(true)
			if got := reopened.Submit(ctx, next); got.Outcome != "storage_error" {
				t.Fatal(got)
			}
			noBatchCall(t, sys)
			fail.Store(false)
			wantID, wantAssociation := oldID, first.a
			if afterRename {
				wantID, wantAssociation = next.RequestID, next.Association
			}
			doc, err := store.Load(ctx)
			if err != nil || len(doc.Applications) != 1 || len(doc.Associations) != 1 {
				t.Fatal("manual configuration lost", doc, err)
			}
			loaded := newBatchService(sys, store).GetSnapshot()
			if loaded.StorageError != nil || loaded.Recovery == nil || loaded.Recovery.Record.RequestID != wantID || loaded.Batch.Items[0].Status != "unknown" || loaded.Batch.Items[0].RequestID != oldID {
				t.Fatal("saved replacement evidence cannot be recovered", loaded)
			}
			// The same process must discover an after-rename replacement even
			// though its in-memory recovery still names the previous request.
			probe := input("retry-needs-current-consent")
			got := reopened.Submit(ctx, probe)
			if got.Outcome != "recovery_query_required" && got.Outcome != "recovery_ack_required" {
				t.Fatal(got)
			}
			if got.Snapshot.Recovery == nil || got.Snapshot.Recovery.Record.RequestID != wantID {
				t.Fatal("same-process retry used stale recovery", got)
			}
			if _, err := reopened.Requery(ctx, wantAssociation); err != nil {
				t.Fatal(err)
			}
			retry := input("confirmed-retry")
			retry.RecoveryRequestID = wantID
			if got := reopened.Submit(ctx, retry); got.Outcome != "accepted" {
				t.Fatal(got)
			}
			sys.complete(nextSingleCall(t, sys, retry.RequestID), true)
			waitState(t, reopened, func(v change.Snapshot) bool { return !v.Busy })
			if v := newBatchService(sys, store).GetSnapshot(); v.StorageError != nil || v.Recovery != nil || v.Batch.Items[0].Status != "unknown" {
				t.Fatal(v)
			}
			noBatchCall(t, sys)
		})
	}
}

// Pause before acquiring the real Store lock so a query can invalidate recovery
// between command admission and its document update.
type gatedRecordUpdate struct {
	config.Repository
	block            atomic.Bool
	entered, release chan struct{}
}

func (g *gatedRecordUpdate) Update(c context.Context, apply func(*config.Document) error) error {
	if g.block.CompareAndSwap(true, false) {
		close(g.entered)
		<-g.release
	}
	return g.Repository.Update(c, apply)
}

func TestBatchSaveRechecksRecoveryAfterWaitingForStorage(t *testing.T) {
	svc, sys, store := batchFixture(t, nil)
	p := prepareBatch(t, svc, selections("one", "two"), target.Path, "")
	svc.StartBatch(p.ID, "", "")
	nextBatchCall(t, sys, "one")
	gate := &gatedRecordUpdate{Repository: store, entered: make(chan struct{}), release: make(chan struct{})}
	reopened := newBatchService(sys, gate)
	p = prepareBatch(t, reopened, selections("one", "two"), target.Path, reopened.GetSnapshot().Batch.ID)
	v := reopened.GetSnapshot()
	if v.Recovery == nil || !v.Recovery.Ready {
		t.Fatal(v)
	}
	before, _ := store.Load(ctx)
	gate.block.Store(true)
	result := make(chan change.BatchResult, 1)
	go func() { result <- reopened.StartBatch(p.ID, "", v.Recovery.Record.RequestID) }()
	<-gate.entered
	sys.mu.Lock()
	sys.queryErr = fmt.Errorf("recovery query failed while saving")
	sys.mu.Unlock()
	if _, err := reopened.Requery(ctx, v.Recovery.Record.Association); err != nil {
		t.Fatal(err)
	}
	close(gate.release)
	got := <-result
	if got.Outcome != "storage_error" || got.Snapshot.Recovery.Ready {
		t.Fatal("cached recovery permission survived a failed query", got)
	}
	after, _ := store.Load(ctx)
	if !bytes.Equal(before.Pending, after.Pending) || !bytes.Equal(before.Batch, after.Batch) {
		t.Fatal("failed recovery check changed durable evidence")
	}
	noBatchCall(t, sys)
}

type failingRecordRead struct {
	config.Repository
	fail atomic.Bool
}

func (r *failingRecordRead) Load(c context.Context) (config.Document, error) {
	if r.fail.Load() {
		return config.Document{}, fmt.Errorf("configuration read unavailable")
	}
	return r.Repository.Load(c)
}

func TestKnownSubmissionReconcilesDespiteLaterStorageReadFailure(t *testing.T) {
	_, sys, store := batchFixture(t, nil)
	repository := &failingRecordRead{Repository: store}
	svc := newBatchService(sys, repository)
	in := input("known-submission")
	if got := svc.Submit(ctx, in); got.Outcome != "accepted" {
		t.Fatal(got)
	}
	sys.complete(nextSingleCall(t, sys, in.RequestID), true)
	waitState(t, svc, func(v change.Snapshot) bool { return !v.Busy })
	repository.fail.Store(true)
	if got := svc.Submit(ctx, in); got.Outcome != "existing" || !got.Request.Confirmed {
		t.Fatal("known result depended on a fresh disk read", got)
	}
	if got := svc.Submit(ctx, input("new-submission")); got.Outcome != "storage_error" {
		t.Fatal("new admission ignored unreadable records", got)
	}
	noBatchCall(t, sys)
}
