package change

import (
	"context"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/config"
)

func TestSubmissionDecisionsDoNotRetainSnapshots(t *testing.T) {
	for _, mode := range []string{"rejected", "never arrived"} {
		t.Run(mode, func(t *testing.T) {
			s := NewService(nil, nil, nil, config.NewStore(filepath.Join(t.TempDir(), "config.json")), nil, Options{WritableKinds: []string{"file"}})
			app := &association.AppCopy{Path: "/Old.app", IconData: strings.Repeat("A", 8192)}
			s.state.Observations = []association.QueryResult{
				{Association: association.Association{Kind: "file", Key: "one"}, Default: association.DefaultObservation{Known: true, App: app}},
				{Association: association.Association{Kind: "file", Key: "two"}, Default: association.DefaultObservation{Known: true, App: app}},
			}
			in := Submission{RequestID: "decision", Association: s.state.Observations[0].Association, TargetPath: "/Target.app"}
			var result SubmitResult
			if mode == "rejected" {
				result = s.Submit(context.Background(), in)
				if result.Outcome != "preflight_error" {
					t.Fatalf("expected a rejected submission, got %s", result.Outcome)
				}
			} else {
				result = *s.ReconcileSubmission(in).Result
				if result.Outcome != "interrupted" {
					t.Fatalf("expected a closed missing submission, got %s", result.Outcome)
				}
			}
			if len(result.Snapshot.Observations) != 2 {
				t.Fatal("the caller must still receive the full snapshot")
			}
			cached, ok := s.decisions[in.RequestID]
			if !ok || cached.result.Outcome != result.Outcome {
				t.Fatal("the decision must remain available to prevent a late submission")
			}
			if !reflect.DeepEqual(cached.result.Snapshot, Snapshot{}) {
				t.Fatalf("cached decision retained a snapshot with %d observations", len(cached.result.Snapshot.Observations))
			}
		})
	}
}
