package change_test

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/change"
	"github.com/sunven/default-apps/internal/config"
	"github.com/sunven/default-apps/internal/discovery"
)

var ctx = context.Background()
var pdf = association.Association{Kind: "file", Key: "com.adobe.pdf"}
var old = association.AppCopy{Path: "/Applications/Old.app", Name: "Old", BundleID: "test.old"}
var target = association.AppCopy{Path: "/Applications/Target.app", Name: "Target", BundleID: "test.target"}

type system struct {
	mu             sync.Mutex
	current        *association.AppCopy
	queryErr       error
	unavailable    bool
	unresolved     bool
	starts         int
	start          chan struct{}
	submitted      func()
	complete       func(*change.NativeError)
	pendingAtStart config.Document
	store          config.Repository
}

func (s *system) ResolveExtension(context.Context, string) ([]catalog.ResolvedType, error) {
	return nil, nil
}
func (s *system) ResolveIdentifier(_ context.Context, key string) ([]catalog.ResolvedType, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.unresolved {
		return nil, nil
	}
	return []catalog.ResolvedType{{Identifier: key, Declared: true}}, nil
}
func (s *system) ReadApplication(_ context.Context, path string) (discovery.Bundle, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	v := target
	v.Path = path
	if s.unavailable {
		v.MetadataError = "missing"
	}
	return discovery.Bundle{App: v}, nil
}
func (s *system) CurrentDefault(context.Context, association.Association) (*association.AppCopy, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.current == nil {
		return nil, s.queryErr
	}
	v := *s.current
	return &v, s.queryErr
}
func (s *system) CandidateApplications(context.Context, association.Association) ([]association.AppCopy, error) {
	return []association.AppCopy{old, target}, nil
}
func (s *system) Dispatch(_ association.Association, _ association.AppCopy, submitted func(), complete func(*change.NativeError)) {
	doc, _ := s.store.Load(ctx)
	s.mu.Lock()
	s.starts++
	s.pendingAtStart = doc
	s.submitted = submitted
	s.complete = complete
	s.mu.Unlock()
	s.start <- struct{}{}
}
func (s *system) finish(current *association.AppCopy, err *change.NativeError) {
	s.mu.Lock()
	s.current = current
	fn := s.complete
	s.mu.Unlock()
	fn(err)
}
func fixture(t *testing.T) (*change.Service, *system, *config.Store) {
	t.Helper()
	store := config.NewStore(filepath.Join(t.TempDir(), "config.json"))
	sys := &system{current: &old, start: make(chan struct{}, 10), store: store}
	svc := change.NewService(catalog.NewService(sys), association.NewService(sys), sys, store, sys, change.Options{WritableKinds: []string{"file", "scheme"}})
	return svc, sys, store
}
func input(id string) change.Submission {
	return change.Submission{RequestID: id, Association: pdf, TargetPath: target.Path, Expected: change.ExpectedDefault{Known: true, Path: old.Path}}
}
func waitStart(t *testing.T, s *system) {
	t.Helper()
	select {
	case <-s.start:
	case <-time.After(time.Second):
		t.Fatal("setter not dispatched")
	}
}
func waitState(t *testing.T, s *change.Service, check func(change.Snapshot) bool) change.Snapshot {
	t.Helper()
	end := time.Now().Add(time.Second)
	for time.Now().Before(end) {
		v := s.GetSnapshot()
		if check(v) {
			return v
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("state not reached: %+v", s.GetSnapshot())
	return change.Snapshot{}
}
func TestAcceptedRequestIsDurableBeforeDispatchAndDoesNotWaitForCompletion(t *testing.T) {
	svc, sys, store := fixture(t)
	if err := store.Update(ctx, func(d *config.Document) error { d.Applications = []association.AppCopy{old}; return nil }); err != nil {
		t.Fatal(err)
	}
	result := svc.Submit(ctx, input("first"))
	if result.Outcome != "accepted" || result.Request == nil || result.Request.Phase != "accepted" {
		t.Fatalf("expected accepted reply: %+v", result)
	}
	waitStart(t, sys)
	sys.mu.Lock()
	doc := sys.pendingAtStart
	sys.mu.Unlock()
	var pending change.PendingRecord
	if err := json.Unmarshal(doc.Pending, &pending); err != nil {
		t.Fatal(err)
	}
	if pending.RequestID != "first" || pending.Target.Path != target.Path || pending.Preflight.App.Path != old.Path || pending.AcceptedAt == "" || pending.Phase != "accepted" || len(doc.Applications) != 1 {
		t.Fatalf("missing durable facts: %+v %+v", pending, doc)
	}
	blocked := input("other")
	blocked.Association = association.Association{Kind: "scheme", Key: "mailto"}
	if got := svc.Submit(ctx, blocked); got.Outcome != "busy" {
		t.Fatalf("global gate: %+v", got)
	}
	sys.submitted()
	got := svc.GetSnapshot()
	if !got.Busy || got.Requests[0].Phase != "submitted" || got.Requests[0].Completion.Known {
		t.Fatalf("waiting state: %+v", got)
	}
	if _, err := svc.Query(ctx, pdf); err != nil {
		t.Fatal(err)
	}
	if !svc.GetSnapshot().Busy {
		t.Fatal("query released pending gate")
	}
}

func TestPreflightBranchesAndRequestIdentity(t *testing.T) {
	svc, sys, _ := fixture(t)
	r := svc.Submit(ctx, input("one"))
	if r.Outcome != "accepted" {
		t.Fatal(r)
	}
	waitStart(t, sys)
	same := svc.Submit(ctx, input("one"))
	if same.Outcome != "existing" {
		t.Fatalf("same id: %+v", same)
	}
	changed := input("one")
	changed.TargetPath = old.Path
	if got := svc.Submit(ctx, changed); got.Outcome != "conflict" {
		t.Fatalf("conflict: %+v", got)
	}
}
func TestPreflightChangedAndAlreadyTargetCallNoSetter(t *testing.T) {
	svc, sys, _ := fixture(t)
	viewed := input("changed")
	viewed.Expected.Path = "/Applications/SomeoneElse.app"
	if got := svc.Submit(ctx, viewed); got.Outcome != "changed" || sys.starts != 0 {
		t.Fatalf("changed: %+v starts=%d", got, sys.starts)
	}
	sys.current = &target
	already := input("already")
	already.Expected.Path = target.Path
	if got := svc.Submit(ctx, already); got.Outcome != "no_change" || sys.starts != 0 {
		t.Fatalf("already: %+v starts=%d", got, sys.starts)
	}
}
func TestCompletionErrorAndReadbackRequireExactTarget(t *testing.T) {
	svc, sys, _ := fixture(t)
	r := svc.Submit(ctx, input("finish"))
	if r.Outcome != "accepted" {
		t.Fatal(r)
	}
	waitStart(t, sys)
	sys.submitted()
	sys.finish(&old, &change.NativeError{Domain: "NSCocoaErrorDomain", Code: 17, Description: "declined"})
	got := waitState(t, svc, func(v change.Snapshot) bool {
		return len(v.Requests) > 0 && v.Requests[0].Completion.Known && v.Requests[0].Readback.State == "valid" && !v.Busy
	})
	if got.Requests[0].Confirmed || got.Requests[0].Completion.Error == nil || got.Requests[0].Completion.Error.Description != "declined" {
		t.Fatalf("error mismatch: %+v", got)
	}
	if got.Busy {
		t.Fatal("gate not released after known readback")
	}
}
func TestInvalidTypeMissingTargetAndQueryFailureDoNotDispatch(t *testing.T) {
	for _, scenario := range []string{"type", "target", "query", "unknown-view"} {
		t.Run(scenario, func(t *testing.T) {
			svc, sys, _ := fixture(t)
			in := input("reject")
			want := "invalid"
			switch scenario {
			case "type":
				sys.unresolved = true
			case "target":
				sys.unavailable = true
				want = "target_unavailable"
			case "query":
				sys.queryErr = fmt.Errorf("cannot query")
				want = "preflight_error"
			case "unknown-view":
				in.Expected.Known = false
				want = "preflight_error"
			}
			r := svc.Submit(ctx, in)
			if r.Outcome != want {
				t.Fatalf("want %s got %+v", want, r)
			}
			if sys.starts != 0 {
				t.Fatal("rejected action dispatched")
			}
		})
	}
}

func TestParallelRetriesReturnOneAcceptedRequestAndOneSetter(t *testing.T) {
	svc, sys, _ := fixture(t)
	var wg sync.WaitGroup
	results := make(chan change.SubmitResult, 12)
	for range 12 {
		wg.Add(1)
		go func() { defer wg.Done(); results <- svc.Submit(ctx, input("parallel")) }()
	}
	wg.Wait()
	close(results)
	for r := range results {
		if r.Outcome != "accepted" && r.Outcome != "existing" {
			t.Fatalf("retry must recover admission: %+v", r)
		}
	}
	waitStart(t, sys)
	sys.mu.Lock()
	defer sys.mu.Unlock()
	if sys.starts != 1 {
		t.Fatalf("setters=%d", sys.starts)
	}
}
func TestConcurrentIdenticalRetriesRecoverACompleteSnapshot(t *testing.T) {
	svc, sys, _ := fixture(t)
	var wg sync.WaitGroup
	results := make(chan change.SubmitResult, 20)
	for range 20 {
		wg.Add(1)
		go func() { defer wg.Done(); results <- svc.Submit(ctx, input("shared")) }()
	}
	wg.Wait()
	close(results)
	for r := range results {
		if r.Request == nil || r.Request.RequestID != "shared" || r.Request.Target.Path != target.Path {
			t.Fatalf("retry lost request facts: %+v", r)
		}
	}
	waitStart(t, sys)
}

func TestPendingObservationOfTargetCannotConfirmBeforeCompletion(t *testing.T) {
	svc, sys, _ := fixture(t)
	svc.Submit(ctx, input("pending-target"))
	waitStart(t, sys)
	sys.submitted()
	sys.mu.Lock()
	sys.current = &target
	sys.mu.Unlock()
	observed, err := svc.Query(ctx, pdf)
	if err != nil || observed.Default.App.Path != target.Path {
		t.Fatal(observed, err)
	}
	got := svc.GetSnapshot()
	if !got.Busy || got.Requests[0].Confirmed || got.Requests[0].Completion.Known {
		t.Fatalf("query invented completion: %+v", got)
	}
	sys.finish(&target, nil)
	got = waitState(t, svc, func(v change.Snapshot) bool { return !v.Busy })
	if !got.Requests[0].Confirmed {
		t.Fatalf("exact path not confirmed: %+v", got)
	}
}
func TestSuccessfulCompletionAtOtherCopyOrNoDefaultIsNotConfirmed(t *testing.T) {
	other := target
	other.Path = "/Other/Target.app"
	for name, value := range map[string]*association.AppCopy{"same-id-copy": &other, "old": &old, "no-default": nil} {
		t.Run(name, func(t *testing.T) {
			svc, sys, store := fixture(t)
			svc.Submit(ctx, input(name))
			waitStart(t, sys)
			sys.submitted()
			sys.finish(value, nil)
			got := waitState(t, svc, func(v change.Snapshot) bool { return !v.Busy })
			if got.Requests[0].Confirmed || got.Requests[0].Readback.State != "valid" {
				t.Fatal(got)
			}
			doc, err := store.Load(ctx)
			if err != nil || len(doc.Pending) != 0 {
				t.Fatal(doc, err)
			}
		})
	}
}
func TestFailedReadbackRetainsLastObservationAndRequeryOnlyQueries(t *testing.T) {
	svc, sys, _ := fixture(t)
	svc.Submit(ctx, input("retry"))
	waitStart(t, sys)
	sys.submitted()
	sys.mu.Lock()
	sys.queryErr = fmt.Errorf("readback unavailable")
	sys.mu.Unlock()
	sys.finish(nil, nil)
	got := waitState(t, svc, func(v change.Snapshot) bool { return v.Requests[0].Readback.State == "failed" })
	if !got.Busy || got.Requests[0].Readback.Observation.App.Path != old.Path || !got.Requests[0].Readback.Observation.Stale {
		t.Fatalf("lost valid observation: %+v", got)
	}
	sys.mu.Lock()
	sys.queryErr = nil
	sys.current = &target
	sys.mu.Unlock()
	got, err := svc.Requery(ctx, pdf)
	if err != nil || got.Busy || !got.Requests[0].Confirmed {
		t.Fatal(got, err)
	}
	sys.mu.Lock()
	defer sys.mu.Unlock()
	if sys.starts != 1 {
		t.Fatalf("retry dispatched %d setters", sys.starts)
	}
}
func TestCompletionReadbackUpdatesAuthoritativeObservations(t *testing.T) {
	svc, sys, _ := fixture(t)
	svc.Submit(ctx, input("observed"))
	waitStart(t, sys)
	sys.submitted()
	sys.finish(&target, nil)
	got := waitState(t, svc, func(v change.Snapshot) bool { return !v.Busy })
	if len(got.Observations) != 1 || got.Observations[0].Default.App.Path != target.Path {
		t.Fatalf("readback missing from shared snapshot: %+v", got)
	}
}
func TestStorageSaveAndClearFailuresRemainSeparateFromSystemResult(t *testing.T) {
	for _, operation := range []string{"save", "clear"} {
		t.Run(operation, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "config.json")
			var fail bool
			store := config.NewStoreWithWriter(path, func(path string, data []byte) error {
				if fail {
					return fmt.Errorf("disk denied")
				}
				return config.AtomicWrite(path, data)
			})
			if err := store.Update(ctx, func(d *config.Document) error { d.Applications = []association.AppCopy{old}; return nil }); err != nil {
				t.Fatal(err)
			}
			sys := &system{current: &old, start: make(chan struct{}, 10), store: store}
			svc := change.NewService(catalog.NewService(sys), association.NewService(sys), sys, store, sys, change.Options{WritableKinds: []string{"file"}})
			fail = operation == "save"
			r := svc.Submit(ctx, input(operation))
			if operation == "save" {
				if r.Outcome != "storage_error" || sys.starts != 0 || svc.GetSnapshot().Busy {
					t.Fatal(r)
				}
			} else {
				if r.Outcome != "accepted" {
					t.Fatal(r)
				}
				waitStart(t, sys)
				sys.submitted()
				fail = true
				sys.finish(&target, nil)
				v := waitState(t, svc, func(v change.Snapshot) bool { return !v.Busy })
				if !v.Requests[0].Confirmed || v.Requests[0].StorageError == nil || v.Requests[0].StorageError.Operation != "clear" {
					t.Fatal(v)
				}
			}
			doc, err := store.Load(ctx)
			if err != nil || len(doc.Applications) != 1 {
				t.Fatal(doc, err)
			}
			if (len(doc.Pending) > 0) != (operation == "clear") {
				t.Fatalf("pending not preserved correctly: %+v", doc)
			}
		})
	}
}
func TestAcceptedLifecycleSurvivesCallerCancellationAndDefendsSnapshots(t *testing.T) {
	svc, sys, _ := fixture(t)
	caller, cancel := context.WithCancel(ctx)
	r := svc.Submit(caller, input("caller"))
	cancel()
	waitStart(t, sys)
	sys.submitted()
	r.Request.Target.Path = "/tampered"
	r.Request.Preflight.App.Path = "/tampered-preflight"
	existing := svc.Submit(ctx, input("caller"))
	existing.Request.Target.Path = "/also-tampered"
	got := svc.GetSnapshot()
	if got.Requests[0].Target.Path != target.Path || got.Requests[0].Preflight.App.Path != old.Path {
		t.Fatal(got)
	}
	sys.finish(&target, nil)
	got = waitState(t, svc, func(v change.Snapshot) bool { return !v.Busy })
	if !got.Requests[0].Confirmed {
		t.Fatal(got)
	}
}

type immediateSystem struct{ *system }

func (s immediateSystem) Dispatch(a association.Association, target association.AppCopy, submitted func(), complete func(*change.NativeError)) {
	s.system.Dispatch(a, target, submitted, complete)
	submitted()
	s.mu.Lock()
	s.current = &target
	s.mu.Unlock()
	complete(nil)
	complete(&change.NativeError{Domain: "late duplicate", Code: 9})
	submitted()
}
func TestImmediateAndDuplicateCompletionsKeepOneMonotonicResult(t *testing.T) {
	store := config.NewStore(filepath.Join(t.TempDir(), "config.json"))
	sys := &system{current: &old, start: make(chan struct{}, 10), store: store}
	var eventMu sync.Mutex
	var versions []uint64
	svc := change.NewService(catalog.NewService(sys), association.NewService(sys), sys, store, immediateSystem{sys}, change.Options{WritableKinds: []string{"file"}, Publish: func(v change.Snapshot) {
		eventMu.Lock()
		versions = append(versions, v.Version)
		eventMu.Unlock()
		if len(v.Requests) > 0 {
			v.Requests[0].Preflight.App.Path = "/event-mutated"
		}
	}})
	accepted := svc.Submit(ctx, input("immediate"))
	if accepted.Outcome != "accepted" || accepted.Request.Preflight.App.Path != old.Path {
		t.Fatal(accepted)
	}
	got := waitState(t, svc, func(v change.Snapshot) bool { return len(v.Requests) > 0 && !v.Busy })
	r := got.Requests[0]
	if !r.Confirmed || r.Completion.Error != nil || r.Phase != "resolved" || r.Preflight.App.Path != old.Path {
		t.Fatalf("completion regressed: %+v", r)
	}
	eventMu.Lock()
	defer eventMu.Unlock()
	for i := 1; i < len(versions); i++ {
		if versions[i] <= versions[i-1] {
			t.Fatalf("versions not monotonic: %v", versions)
		}
	}
}
func TestLateCallbackForResolvedRequestCannotReplaceNewPendingRecordOrReleaseGate(t *testing.T) {
	svc, sys, store := fixture(t)
	svc.Submit(ctx, input("first-old"))
	waitStart(t, sys)
	sys.mu.Lock()
	oldSubmitted, oldComplete := sys.submitted, sys.complete
	sys.mu.Unlock()
	oldSubmitted()
	sys.finish(&target, nil)
	waitState(t, svc, func(v change.Snapshot) bool { return !v.Busy })
	next := input("second-new")
	next.Association = association.Association{Kind: "scheme", Key: "mailto"}
	next.TargetPath = old.Path
	next.Expected.Path = target.Path
	result := svc.Submit(ctx, next)
	if result.Outcome != "accepted" {
		t.Fatal(result)
	}
	waitStart(t, sys)
	oldComplete(&change.NativeError{Domain: "duplicate", Code: 55})
	oldSubmitted()
	observed := svc.GetSnapshot()
	doc, err := store.Load(ctx)
	var pending change.PendingRecord
	_ = json.Unmarshal(doc.Pending, &pending)
	if err != nil || !observed.Busy || observed.ActiveRequestID != "second-new" || pending.RequestID != "second-new" {
		t.Fatal(observed, pending, err)
	}
	sys.finish(&old, nil)
	waitState(t, svc, func(v change.Snapshot) bool { return !v.Busy })
}
func TestProductionCapabilityDoesNotAdmitWrites(t *testing.T) {
	store := config.NewStore(filepath.Join(t.TempDir(), "config.json"))
	sys := &system{current: &old, start: make(chan struct{}, 1), store: store}
	svc := change.NewService(catalog.NewService(sys), association.NewService(sys), sys, store, change.DisabledDispatcher{}, change.Options{})
	got := svc.Submit(ctx, input("production"))
	doc, _ := store.Load(ctx)
	if got.Outcome != "unavailable" || sys.starts != 0 || len(doc.Pending) > 0 || len(svc.GetSnapshot().WritableKinds) > 0 {
		t.Fatal(got, doc)
	}
}
