package change_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/change"
)

type schemeSystem struct {
	*system
	defaults map[association.Association]*association.AppCopy
}

func (s *schemeSystem) CurrentDefault(_ context.Context, a association.Association) (*association.AppCopy, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if app := s.defaults[a]; app != nil {
		copy := *app
		return &copy, s.queryErr
	}
	return nil, s.queryErr
}

func TestSchemeRequestKeepsHTTPAndHTTPSIndependentAndGatesFileChanges(t *testing.T) {
	_, base, store := fixture(t)
	http := association.Association{Kind: "scheme", Key: "http"}
	https := association.Association{Kind: "scheme", Key: "https"}
	sys := &schemeSystem{system: base, defaults: map[association.Association]*association.AppCopy{http: &old, https: &old, pdf: &old}}
	svc := change.NewService(catalog.NewService(sys), association.NewService(sys), sys, store, sys, change.Options{WritableKinds: []string{"file", "scheme"}})
	in := input("http-only")
	in.Association = http
	if got := svc.Submit(ctx, in); got.Outcome != "accepted" {
		t.Fatal(got)
	}
	waitStart(t, base)
	sys.submitted()
	sameID := in
	sameID.Association = https
	if got := svc.Submit(ctx, sameID); got.Outcome != "conflict" {
		t.Fatalf("scheme identity was merged: %+v", got)
	}
	for _, a := range []association.Association{pdf, https} {
		next := input("blocked-" + a.Kind)
		next.Association = a
		if got := svc.Submit(ctx, next); got.Outcome != "busy" {
			t.Fatalf("cross-association gate: %+v", got)
		}
		if got, err := svc.Query(ctx, a); err != nil || !got.Default.Known || got.Default.App.Path != old.Path {
			t.Fatal(got, err)
		}
	}
	sys.mu.Lock()
	sys.defaults[http] = &target
	sys.mu.Unlock()
	sys.finish(&target, nil)
	got := waitState(t, svc, func(v change.Snapshot) bool { return !v.Busy })
	if len(got.Requests) != 1 || !got.Requests[0].Confirmed || got.Requests[0].Association != http {
		t.Fatal(got)
	}
	for _, test := range []struct {
		a    association.Association
		path string
	}{{http, target.Path}, {https, old.Path}, {pdf, old.Path}} {
		result, err := svc.Query(ctx, test.a)
		if err != nil || result.Default.App.Path != test.path {
			t.Fatal(result, err)
		}
	}
	sys.mu.Lock()
	defer sys.mu.Unlock()
	if sys.starts != 1 {
		t.Fatalf("one explicit http action started %d setters", sys.starts)
	}
}

func TestSchemeCompletionRequiresIndependentExactCopyAndRetainsRawError(t *testing.T) {
	other := target
	other.Path = "/Other/Target.app"
	nativeError := &change.NativeError{Domain: "ObservedDomain", Code: -73, Description: "raw scheme detail"}
	for _, test := range []struct {
		name        string
		actual      *association.AppCopy
		nativeError *change.NativeError
		queryError  error
		confirmed   bool
	}{
		{"exact", &target, nil, nil, true}, {"same-id-copy", &other, nil, nil, false}, {"old", &old, nil, nil, false},
		{"native-error-even-at-target", &target, nativeError, nil, false}, {"readback-failure", nil, nil, fmt.Errorf("scheme query failed"), false},
	} {
		t.Run(test.name, func(t *testing.T) {
			svc, sys, _ := fixture(t)
			in := input(test.name)
			in.Association = association.Association{Kind: "scheme", Key: "test-scheme"}
			if got := svc.Submit(ctx, in); got.Outcome != "accepted" {
				t.Fatal(got)
			}
			waitStart(t, sys)
			sys.submitted()
			sys.mu.Lock()
			sys.queryErr = test.queryError
			sys.mu.Unlock()
			sys.finish(test.actual, test.nativeError)
			got := waitState(t, svc, func(v change.Snapshot) bool {
				return v.Requests[0].Completion.Known && ((test.queryError != nil && v.Requests[0].Readback.State == "failed") || (test.queryError == nil && !v.Busy))
			})
			request := got.Requests[0]
			if request.Confirmed != test.confirmed || request.Association != in.Association || request.Target.Path != target.Path {
				t.Fatal(got)
			}
			if test.nativeError != nil && (request.Completion.Error == nil || *request.Completion.Error != *test.nativeError) {
				t.Fatal(request.Completion)
			}
			if test.queryError != nil {
				if !got.Busy || request.Readback.State != "failed" {
					t.Fatal(got)
				}
				if blocked := svc.Submit(ctx, input("file-after-scheme-readback-failure")); blocked.Outcome != "busy" {
					t.Fatal(blocked)
				}
				sys.mu.Lock()
				sys.queryErr = nil
				sys.current = &target
				sys.mu.Unlock()
				resolved, err := svc.Requery(ctx, in.Association)
				if err != nil || resolved.Busy || !resolved.Requests[0].Confirmed {
					t.Fatal(resolved, err)
				}
			}
			sys.mu.Lock()
			defer sys.mu.Unlock()
			if sys.starts != 1 {
				t.Fatalf("readback repeated setter: %d", sys.starts)
			}
		})
	}
}

func TestRecoveredSchemeRemainsUnknownAndRequiresAcknowledgementForFileChange(t *testing.T) {
	svc, sys, store := fixture(t)
	in := input("previous-scheme")
	in.Association = association.Association{Kind: "scheme", Key: "test-recovered"}
	if got := svc.Submit(ctx, in); got.Outcome != "accepted" {
		t.Fatal(got)
	}
	waitStart(t, sys)
	sys.mu.Lock()
	sys.current = &target
	sys.mu.Unlock()
	reopened := restart(t, store, sys)
	first := reopened.GetSnapshot()
	if first.Recovery == nil || first.Recovery.Record.Association != in.Association || !first.Busy {
		t.Fatal(first)
	}
	observed, err := reopened.Requery(ctx, in.Association)
	if err != nil || !observed.Recovery.Ready || observed.Requests[0].Completion.Known || observed.Requests[0].Confirmed || observed.Observations[0].Default.App.Path != target.Path {
		t.Fatal(observed, err)
	}
	next := input("explicit-file")
	next.Expected.Path = target.Path
	next.TargetPath = old.Path
	if got := reopened.Submit(ctx, next); got.Outcome != "recovery_ack_required" {
		t.Fatal(got)
	}
	if got := reopened.Submit(ctx, in); got.Outcome != "existing" || got.Request.Phase != "recovered" {
		t.Fatal(got)
	}
	sys.mu.Lock()
	defer sys.mu.Unlock()
	if sys.starts != 1 {
		t.Fatalf("recovery replayed a setter: %d", sys.starts)
	}
}
