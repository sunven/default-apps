package association_test

import (
	"context"
	"errors"
	"testing"

	"github.com/sunven/default-apps/internal/association"
)

type systemStub struct {
	current       *association.AppCopy
	candidates    []association.AppCopy
	currentErr    error
	candidatesErr error
}

func (s *systemStub) CurrentDefault(context.Context, association.Association) (*association.AppCopy, error) {
	return s.current, s.currentErr
}
func (s *systemStub) CandidateApplications(context.Context, association.Association) ([]association.AppCopy, error) {
	return s.candidates, s.candidatesErr
}

var pdf = association.Association{Kind: "file", Key: "com.adobe.pdf"}

func TestQueryKeepsCurrentDefaultIndependentFromCandidates(t *testing.T) {
	current := association.AppCopy{Path: "/Volumes/Archive/Reader.app", DisplayPath: "/Volumes/Archive/Reader.app", Name: "Reader", Version: "2.0", BundleID: "test.reader"}
	system := &systemStub{current: &current, candidates: []association.AppCopy{{Path: "/Applications/Preview.app", Name: "Preview"}}}
	result, err := association.NewService(system).Query(context.Background(), pdf)
	if err != nil {
		t.Fatal(err)
	}
	if !result.Default.Known || result.Default.App == nil || result.Default.App.Path != current.Path {
		t.Fatalf("current default outside the catalog must remain visible: %#v", result.Default)
	}
	if !result.Candidates.Known || len(result.Candidates.Apps) != 1 || result.Candidates.Apps[0].Path != "/Applications/Preview.app" {
		t.Fatalf("candidates must come from their own query: %#v", result.Candidates)
	}
	if result.Default.App.Version != "2.0" || result.Default.App.BundleID != "test.reader" {
		t.Fatalf("copy metadata lost: %#v", result.Default.App)
	}
}

func TestRefreshFailureRetainsLastValidObservationsIndependently(t *testing.T) {
	system := &systemStub{current: &association.AppCopy{Path: "/Applications/Reader.app"}, candidates: []association.AppCopy{{Path: "/Applications/Reader.app"}}}
	service := association.NewService(system)
	first, _ := service.Query(context.Background(), pdf)
	system.currentErr = errors.New("default query unavailable")
	system.candidates = nil
	second, err := service.Query(context.Background(), pdf)
	if err != nil {
		t.Fatal(err)
	}
	if !second.Default.Known || second.Default.App == nil || second.Default.App.Path != "/Applications/Reader.app" || !second.Default.Stale || second.Default.Error == nil || second.Default.ObservedAt != first.Default.ObservedAt {
		t.Fatalf("failed refresh must retain the last default: %#v", second.Default)
	}
	if !second.Candidates.Known || len(second.Candidates.Apps) != 0 || second.Candidates.Stale || second.Candidates.Error != nil {
		t.Fatalf("successful empty candidates must be independent: %#v", second.Candidates)
	}
	system.currentErr = nil
	system.current = nil
	system.candidatesErr = errors.New("candidate query unavailable")
	third, _ := service.Query(context.Background(), pdf)
	if !third.Default.Known || third.Default.App != nil || third.Default.Stale || third.Default.Error != nil {
		t.Fatalf("successful no-default must replace stale observation: %#v", third.Default)
	}
	if !third.Candidates.Known || !third.Candidates.Stale || third.Candidates.Error == nil || third.Candidates.ObservedAt != second.Candidates.ObservedAt {
		t.Fatalf("failed candidates must retain the last empty observation: %#v", third.Candidates)
	}
	if third.Version <= second.Version || second.Version <= first.Version {
		t.Fatalf("refresh observations must advance versions: %d %d %d", first.Version, second.Version, third.Version)
	}
}

func TestCandidatesMergeOnlyTheSameCanonicalBundlePath(t *testing.T) {
	system := &systemStub{candidates: []association.AppCopy{
		{Path: "/Applications/Reader.app", DisplayPath: "/Users/me/Reader Alias.app", Name: "Reader", BundleID: "test.reader"},
		{Path: "/Applications/Reader.app", DisplayPath: "/Applications/Reader.app", Name: "Reader", BundleID: "test.reader"},
		{Path: "/Volumes/CaseSensitive/Reader.app", Name: "Reader", BundleID: "test.reader"},
		{Path: "/Volumes/CaseSensitive/reader.app", Name: "Reader", BundleID: "test.reader"},
	}}
	result, _ := association.NewService(system).Query(context.Background(), pdf)
	if len(result.Candidates.Apps) != 3 {
		t.Fatalf("same bundle ID and case-distinct paths are separate copies; canonical aliases merge: %#v", result.Candidates.Apps)
	}
	if result.Candidates.Apps[0].DisplayPath != "/Users/me/Reader Alias.app" {
		t.Fatal("display path must be preserved")
	}
}

func TestInitialQueryErrorsAreNotReportedAsEmptySuccess(t *testing.T) {
	system := &systemStub{currentErr: errors.New("default unavailable"), candidatesErr: errors.New("candidates unavailable")}
	result, err := association.NewService(system).Query(context.Background(), pdf)
	if err != nil {
		t.Fatal(err)
	}
	if result.Default.Known || result.Default.Error == nil || result.Default.Stale || result.Candidates.Known || result.Candidates.Error == nil || result.Candidates.Stale {
		t.Fatalf("initial failures have no observation to fall back to: %#v", result)
	}
}

func TestLastValidObservationOwnsItsCopyMetadata(t *testing.T) {
	system := &systemStub{current: &association.AppCopy{Path: "/Applications/Reader.app", Name: "Reader"}, candidates: []association.AppCopy{{Path: "/Applications/Reader.app", Name: "Reader"}}}
	service := association.NewService(system)
	first, _ := service.Query(context.Background(), pdf)
	first.Default.App.Name = "changed by consumer"
	first.Candidates.Apps[0].Name = "changed by consumer"
	system.current.Name = "changed by adapter"
	system.candidates[0].Name = "changed by adapter"
	system.currentErr = errors.New("offline")
	system.candidatesErr = errors.New("offline")
	again, _ := service.Query(context.Background(), pdf)
	if again.Default.App.Name != "Reader" || again.Candidates.Apps[0].Name != "Reader" {
		t.Fatalf("the last observation must survive later mutation outside the service: %#v %#v", again.Default.App, again.Candidates.Apps)
	}
}
