package change_test

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"sync/atomic"
	"testing"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/change"
	"github.com/sunven/default-apps/internal/config"
)

func restart(t *testing.T, store config.Repository, sys *system) *change.Service {
	t.Helper()
	return change.NewService(catalog.NewService(sys), association.NewService(sys), sys, store, sys, change.Options{WritableKinds: []string{"file", "scheme"}})
}

func TestRestartQueriesCurrentDefaultWithoutReplayingOrConfirmingOldRequest(t *testing.T) {
	svc, sys, store := fixture(t)
	svc.Submit(ctx, input("old-process"))
	waitStart(t, sys)
	sys.mu.Lock()
	sys.current = &target
	sys.mu.Unlock()
	reopened := restart(t, store, sys)
	initial := reopened.GetSnapshot()
	if initial.Recovery == nil || initial.Recovery.Record.RequestID != "old-process" || !initial.Busy || initial.ActiveRequestID != "" {
		t.Fatalf("recovery facts: %+v", initial)
	}
	after, err := reopened.Requery(ctx, pdf)
	if err != nil || after.Busy || !after.Recovery.Ready || after.Requests[0].Completion.Known || after.Requests[0].Confirmed || after.Requests[0].Phase != "recovered" {
		t.Fatalf("old result must stay unknown: %+v %v", after, err)
	}
	if after.Observations[0].Default.App.Path != target.Path {
		t.Fatal(after)
	}
	sys.mu.Lock()
	starts := sys.starts
	sys.mu.Unlock()
	doc, _ := store.Load(ctx)
	var record change.PendingRecord
	_ = json.Unmarshal(doc.Pending, &record)
	if starts != 1 || record.RequestID != "old-process" {
		t.Fatalf("replay/record loss: %d %+v", starts, record)
	}
}

func TestRecoveredRecordRequiresValidQueryAndExplicitAcknowledgementBeforeReplacement(t *testing.T) {
	svc, sys, store := fixture(t)
	svc.Submit(ctx, input("old-record"))
	waitStart(t, sys)
	reopened := restart(t, store, sys)
	sys.mu.Lock()
	sys.queryErr = fmt.Errorf("offline")
	sys.mu.Unlock()
	failed, _ := reopened.Requery(ctx, pdf)
	if !failed.Busy || failed.Recovery.Ready {
		t.Fatal(failed)
	}
	next := input("new-record")
	next.RecoveryRequestID = "old-record"
	if got := reopened.Submit(ctx, next); got.Outcome != "recovery_query_required" {
		t.Fatal(got)
	}
	sys.mu.Lock()
	sys.queryErr = nil
	sys.mu.Unlock()
	reopened.Requery(ctx, pdf)
	next.RecoveryRequestID = ""
	if got := reopened.Submit(ctx, next); got.Outcome != "recovery_ack_required" {
		t.Fatal(got)
	}
	doc, _ := store.Load(ctx)
	var record change.PendingRecord
	_ = json.Unmarshal(doc.Pending, &record)
	if record.RequestID != "old-record" {
		t.Fatal(record)
	}
	next.RecoveryRequestID = "old-record"
	if got := reopened.Submit(ctx, next); got.Outcome != "accepted" || got.Snapshot.Recovery != nil {
		t.Fatal(got)
	}
	waitStart(t, sys)
	doc, _ = store.Load(ctx)
	_ = json.Unmarshal(doc.Pending, &record)
	if record.RequestID != "new-record" {
		t.Fatal(record)
	}
}

func TestFailedReplacementPreservesOldRecordAndManualConfiguration(t *testing.T) {
	var denied atomic.Bool
	store := config.NewStoreWithWriter(filepath.Join(t.TempDir(), "config.json"), func(path string, data []byte) error {
		if denied.Load() {
			return fmt.Errorf("disk denied")
		}
		return config.AtomicWrite(path, data)
	})
	sys := &system{current: &old, start: make(chan struct{}, 4), store: store}
	store.Update(ctx, func(doc *config.Document) error { doc.Applications = []association.AppCopy{old}; return nil })
	svc := restart(t, store, sys)
	svc.Submit(ctx, input("preserved-old"))
	waitStart(t, sys)
	reopened := restart(t, store, sys)
	reopened.Requery(ctx, pdf)
	next := input("replacement")
	next.RecoveryRequestID = "preserved-old"
	denied.Store(true)
	if result := reopened.Submit(ctx, next); result.Outcome != "storage_error" || result.Snapshot.Recovery == nil {
		t.Fatal(result)
	}
	doc, _ := store.Load(ctx)
	var pending change.PendingRecord
	json.Unmarshal(doc.Pending, &pending)
	if pending.RequestID != "preserved-old" || len(doc.Applications) != 1 {
		t.Fatal(doc)
	}
	sys.mu.Lock()
	starts := sys.starts
	sys.mu.Unlock()
	if starts != 1 {
		t.Fatal(starts)
	}
}

func TestClearFailureRestartsAsUnknownAndOldExternalChangeNeverBecomesCompletion(t *testing.T) {
	var denied atomic.Bool
	store := config.NewStoreWithWriter(filepath.Join(t.TempDir(), "config.json"), func(path string, data []byte) error {
		if denied.Load() {
			return fmt.Errorf("clear denied")
		}
		return config.AtomicWrite(path, data)
	})
	sys := &system{current: &old, start: make(chan struct{}, 4), store: store}
	svc := restart(t, store, sys)
	svc.Submit(ctx, input("clear-leftover"))
	waitStart(t, sys)
	denied.Store(true)
	sys.finish(&target, nil)
	known := waitState(t, svc, func(v change.Snapshot) bool { return !v.Busy })
	if !known.Requests[0].Confirmed || known.Requests[0].StorageError == nil {
		t.Fatal(known)
	}
	reopened := restart(t, store, sys)
	recovered, _ := reopened.Requery(ctx, pdf)
	if recovered.Requests[0].Confirmed || recovered.Requests[0].Completion.Known || !recovered.Recovery.Ready {
		t.Fatal(recovered)
	}
	denied.Store(false)
	next := input("new-process")
	next.TargetPath = old.Path
	next.Expected.Path = target.Path
	next.RecoveryRequestID = "clear-leftover"
	if result := reopened.Submit(ctx, next); result.Outcome != "accepted" {
		t.Fatal(result)
	}
	waitStart(t, sys)
	sys.mu.Lock()
	sys.current = &target
	sys.mu.Unlock()
	current, _ := reopened.Requery(ctx, pdf)
	if !current.Busy || current.Requests[0].Completion.Known || current.Requests[1].Completion.Known || current.Observations[0].Default.App.Path != target.Path {
		t.Fatal(current)
	}
}

type recoveryReader struct {
	*system
	entered, release chan struct{}
}

func (r recoveryReader) ReadApplicationCopy(c context.Context, path string) (association.AppCopy, error) {
	close(r.entered)
	<-r.release
	return r.system.ReadApplicationCopy(c, path)
}
func TestRecoveredQueryFailureDuringAnotherAssociationsPreflightKeepsOldRecord(t *testing.T) {
	svc, sys, store := fixture(t)
	svc.Submit(ctx, input("old-facts"))
	waitStart(t, sys)
	reader := recoveryReader{system: sys, entered: make(chan struct{}), release: make(chan struct{})}
	reopened := change.NewService(catalog.NewService(sys), association.NewService(sys), reader, store, sys, change.Options{WritableKinds: []string{"file", "scheme"}})
	reopened.Requery(ctx, pdf)
	next := input("other-association")
	next.Association = association.Association{Kind: "scheme", Key: "ticket08-other"}
	next.RecoveryRequestID = "old-facts"
	result := make(chan change.SubmitResult, 1)
	go func() { result <- reopened.Submit(ctx, next) }()
	<-reader.entered
	sys.mu.Lock()
	sys.queryErr = fmt.Errorf("recovery observation unavailable")
	sys.mu.Unlock()
	reopened.Requery(ctx, pdf)
	close(reader.release)
	got := <-result
	if got.Outcome != "recovery_query_required" {
		t.Fatal(got)
	}
	doc, _ := store.Load(ctx)
	var record change.PendingRecord
	json.Unmarshal(doc.Pending, &record)
	if record.RequestID != "old-facts" {
		t.Fatal(record)
	}
}

func TestRecoveredRequestIDCannotBeReusedToReplayTheOldSetter(t *testing.T) {
	svc, sys, store := fixture(t)
	svc.Submit(ctx, input("original-id"))
	waitStart(t, sys)
	reopened := restart(t, store, sys)
	reopened.Requery(ctx, pdf)
	same := input("original-id")
	same.RecoveryRequestID = "original-id"
	if got := reopened.Submit(ctx, same); got.Outcome != "existing" || got.Request.Phase != "recovered" {
		t.Fatal(got)
	}
	different := same
	different.TargetPath = "/Another.app"
	if got := reopened.Submit(ctx, different); got.Outcome != "conflict" {
		t.Fatal(got)
	}
	sys.mu.Lock()
	defer sys.mu.Unlock()
	if sys.starts != 1 {
		t.Fatal("old id replayed", sys.starts)
	}
}
