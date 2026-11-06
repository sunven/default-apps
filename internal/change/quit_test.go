package change_test

import (
	"context"
	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/change"
	"github.com/sunven/default-apps/internal/config"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

func TestQuitRoutesShareOnePromptAndStayKeepsQueriesAvailable(t *testing.T) {
	svc, sys, _ := fixture(t)
	svc.Submit(ctx, input("waiting"))
	waitStart(t, sys)
	for range 3 {
		if svc.RequestQuit() {
			t.Fatal("pending request allowed exit")
		}
	}
	prompt := svc.GetSnapshot().Quit
	if !prompt.Prompt || prompt.PromptID != 1 || prompt.Exiting {
		t.Fatal(prompt)
	}
	if result := svc.RespondQuit(prompt.PromptID, false); result.Quit.Prompt || result.Quit.Exiting {
		t.Fatal(result)
	}
	if _, err := svc.Query(ctx, pdf); err != nil {
		t.Fatal(err)
	}
	if svc.RequestQuit() || svc.GetSnapshot().Quit.PromptID != 2 {
		t.Fatal("second distinct prompt missing")
	}
	svc.RespondQuit(prompt.PromptID, true)
	if svc.GetSnapshot().Quit.Exiting {
		t.Fatal("stale response exited")
	}
	start := time.Now()
	if svc.RequestQuit() || time.Since(start) > 50*time.Millisecond {
		t.Fatal("hook blocked")
	}
}

func TestCompletionWhilePromptOpenDoesNotExitWithoutExplicitChoice(t *testing.T) {
	svc, sys, _ := fixture(t)
	svc.Submit(ctx, input("completing"))
	waitStart(t, sys)
	svc.RequestQuit()
	prompt := svc.GetSnapshot().Quit
	sys.finish(&target, nil)
	waitState(t, svc, func(v change.Snapshot) bool { return !v.Busy })
	if svc.RequestQuit() || svc.GetSnapshot().Quit.PromptID != prompt.PromptID {
		t.Fatal("completion bypassed open prompt")
	}
	svc.RespondQuit(prompt.PromptID, false)
	if !svc.RequestQuit() {
		t.Fatal("resolved request still blocked a new quit")
	}
}

func TestExitClosesAdmissionOnceAndLateCallbacksPreserveDurableUncertainty(t *testing.T) {
	_, sys, store := fixture(t)
	exits := make(chan struct{}, 3)
	svc := change.NewService(catalog.NewService(sys), association.NewService(sys), sys, store, sys, change.Options{WritableKinds: []string{"file"}, Quit: func() { exits <- struct{}{} }})
	svc.Submit(ctx, input("leaving"))
	waitStart(t, sys)
	svc.RequestQuit()
	prompt := svc.GetSnapshot().Quit
	svc.RespondQuit(prompt.PromptID, true)
	svc.RespondQuit(prompt.PromptID, true)
	select {
	case <-exits:
	case <-time.After(time.Second):
		t.Fatal("exit not dispatched")
	}
	select {
	case <-exits:
		t.Fatal("exit dispatched twice")
	default:
	}
	if !svc.RequestQuit() {
		t.Fatal("approved exit prompted again")
	}
	if got := svc.Submit(ctx, input("too-late")); got.Outcome != "exiting" {
		t.Fatal(got)
	}
	before := svc.GetSnapshot()
	sys.submitted()
	sys.finish(&target, nil)
	after := svc.GetSnapshot()
	if after.Version != before.Version || after.Requests[0].Completion.Known {
		t.Fatalf("late callback changed exiting session: %+v", after)
	}
	doc, _ := store.Load(ctx)
	if len(doc.Pending) == 0 {
		t.Fatal("exit lost record")
	}
}

func TestQuitDuringDurableSaveReturnsImmediatelyAndPreventsDispatchAfterExit(t *testing.T) {
	entered, release := make(chan struct{}), make(chan struct{})
	store := config.NewStoreWithWriter(filepath.Join(t.TempDir(), "config.json"), func(path string, data []byte) error { close(entered); <-release; return config.AtomicWrite(path, data) })
	sys := &system{current: &old, start: make(chan struct{}, 1), store: store}
	svc := restart(t, store, sys)
	outcome := make(chan change.SubmitResult, 1)
	go func() { outcome <- svc.Submit(ctx, input("saving-at-exit")) }()
	<-entered
	hook := make(chan bool, 1)
	go func() { hook <- svc.RequestQuit() }()
	select {
	case allowed := <-hook:
		if allowed {
			t.Fatal("pending save bypassed warning")
		}
	case <-time.After(time.Second):
		t.Fatal("quit blocked on storage")
	}
	prompt := svc.GetSnapshot().Quit
	svc.RespondQuit(prompt.PromptID, true)
	close(release)
	result := <-outcome
	if result.Outcome != "exiting" {
		t.Fatal(result)
	}
	select {
	case <-sys.start:
		t.Fatal("dispatched after exit")
	default:
	}
	doc, err := store.Load(ctx)
	if err != nil || len(doc.Pending) == 0 {
		t.Fatal(doc, err)
	}
	reopened := restart(t, store, sys)
	if state := reopened.GetSnapshot(); state.Recovery == nil || state.Recovery.Record.RequestID != "saving-at-exit" {
		t.Fatal(state)
	}
}

type exitQuerySystem struct {
	*system
	entered chan struct{}
	release chan struct{}
	calls   atomic.Int64
}

func (s *exitQuerySystem) CurrentDefault(ctx context.Context, a association.Association) (*association.AppCopy, error) {
	s.calls.Add(1)
	close(s.entered)
	<-s.release
	return s.system.CurrentDefault(ctx, a)
}
func TestExitDiscardsInflightQueryAndPreventsNewQueriesOrPublications(t *testing.T) {
	_, sys, store := fixture(t)
	blocking := &exitQuerySystem{system: sys, entered: make(chan struct{}), release: make(chan struct{})}
	var events atomic.Int64
	svc := change.NewService(catalog.NewService(sys), association.NewService(blocking), sys, store, sys, change.Options{WritableKinds: []string{"file"}, Publish: func(change.Snapshot) { events.Add(1) }})
	queryDone := make(chan error, 1)
	go func() { _, err := svc.Query(ctx, pdf); queryDone <- err }()
	<-blocking.entered
	if !svc.RequestQuit() {
		t.Fatal("no unresolved request should permit exit")
	}
	before := svc.GetSnapshot()
	close(blocking.release)
	if err := <-queryDone; err == nil {
		t.Fatal("inflight query delivered after exit")
	}
	if _, err := svc.Query(ctx, pdf); err == nil {
		t.Fatal("new query started after exit")
	}
	after := svc.GetSnapshot()
	if before.Version != after.Version || len(after.Observations) != 0 || events.Load() != 0 || blocking.calls.Load() != 1 {
		t.Fatal(before, after, events.Load(), blocking.calls.Load())
	}
}
