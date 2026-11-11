package change_test

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/change"
	"github.com/sunven/default-apps/internal/config"
)

type iconQuerySystem struct{ app association.AppCopy }

func (s iconQuerySystem) CurrentDefault(context.Context, association.Association) (*association.AppCopy, error) {
	app := s.app
	return &app, nil
}
func (s iconQuerySystem) CandidateApplications(context.Context, association.Association) ([]association.AppCopy, error) {
	return []association.AppCopy{s.app}, nil
}

func TestBrowsingPublishesOnlyChangedObservation(t *testing.T) {
	const count = 600
	system := iconQuerySystem{app: association.AppCopy{Path: "/Applications/Reader.app", Name: "Reader", IconData: strings.Repeat("A", 16000)}}
	var fullEvents, observationEvents, payloadBytes int
	svc := change.NewService(nil, association.NewService(system), nil, config.NewStore(filepath.Join(t.TempDir(), "config.json")), nil, change.Options{
		Publish: func(value change.Snapshot) {
			fullEvents++
			data, _ := json.Marshal(value)
			payloadBytes += len(data)
		},
		PublishObservation: func(value association.QueryResult) {
			if value.Association.Key != fmt.Sprintf("test.type.%d", observationEvents) {
				t.Errorf("published a different row: %+v", value.Association)
			}
			observationEvents++
			data, _ := json.Marshal(value)
			payloadBytes += len(data)
		},
	})
	for i := range count {
		if _, err := svc.Query(ctx, association.Association{Kind: "file", Key: fmt.Sprintf("test.type.%d", i)}); err != nil {
			t.Fatal(err)
		}
	}
	t.Logf("%d queries: %d full events, %d observation events, %.2f MiB serialized", count, fullEvents, observationEvents, float64(payloadBytes)/(1024*1024))
	if fullEvents != 0 || observationEvents != count || payloadBytes > count*40000 {
		t.Fatal("ordinary browsing resent accumulated observations instead of one result per query")
	}
	// Initial loading/reconnection still has a complete, detached snapshot.
	snapshot := svc.GetSnapshot()
	if len(snapshot.Observations) != count {
		t.Fatalf("initial snapshot lost observations: %d", len(snapshot.Observations))
	}
	snapshot.Observations[0].Default.App.Name = "mutated"
	if svc.GetSnapshot().Observations[0].Default.App.Name != "Reader" {
		t.Fatal("snapshot mutation changed cached observations")
	}
}

func TestObservationPublicationCannotMutateCacheOrQueryReply(t *testing.T) {
	_, system, store := fixture(t)
	events := 0
	svc := change.NewService(catalog.NewService(system), association.NewService(system), system, store, system, change.Options{
		PublishObservation: func(value association.QueryResult) {
			events++
			value.Default.App.Path = "/Changed.app"
			value.Candidates.Apps[0].Path = "/Changed.app"
		},
	})
	result, err := svc.Query(ctx, pdf)
	if err != nil || events != 1 || result.Default.App.Path != old.Path || result.Candidates.Apps[0].Path != old.Path {
		t.Fatalf("observation callback changed the query reply: events=%d result=%+v error=%v", events, result, err)
	}
	if cached := svc.GetSnapshot().Observations[0]; cached.Default.App.Path != old.Path || cached.Candidates.Apps[0].Path != old.Path {
		t.Fatal("observation callback changed service state")
	}
}

func TestRecoveryQueryStillPublishesLifecycleTransition(t *testing.T) {
	original, system, store := fixture(t)
	if result := original.Submit(ctx, input("recovered")); result.Outcome != "accepted" {
		t.Fatal(result)
	}
	waitStart(t, system)
	var snapshot change.Snapshot
	observations := 0
	reopened := change.NewService(catalog.NewService(system), association.NewService(system), system, store, system, change.Options{
		Publish:            func(value change.Snapshot) { snapshot = value },
		PublishObservation: func(association.QueryResult) { observations++ },
	})
	if initial := reopened.GetSnapshot(); initial.Recovery == nil || !initial.Busy {
		t.Fatal("fixture has no recovery gate")
	}
	if _, err := reopened.Query(ctx, pdf); err != nil {
		t.Fatal(err)
	}
	if observations != 1 || snapshot.Recovery == nil || !snapshot.Recovery.Ready || snapshot.Busy || len(snapshot.Observations) != 1 {
		t.Fatalf("recovery readiness was not published: observations=%d snapshot=%+v", observations, snapshot)
	}
}

func TestCompletionReadbackStillPublishesResolvedLifecycle(t *testing.T) {
	_, system, store := fixture(t)
	events := make(chan change.Snapshot, 10)
	observations := make(chan association.QueryResult, 10)
	svc := change.NewService(catalog.NewService(system), association.NewService(system), system, store, system, change.Options{
		WritableKinds:      []string{"file"},
		Publish:            func(value change.Snapshot) { events <- value },
		PublishObservation: func(value association.QueryResult) { observations <- value },
	})
	if result := svc.Submit(ctx, input("finished")); result.Outcome != "accepted" {
		t.Fatal(result)
	}
	waitStart(t, system)
	system.finish(&target, nil)
	deadline := time.After(time.Second)
	for {
		select {
		case snapshot := <-events:
			if len(snapshot.Requests) == 1 && snapshot.Requests[0].Confirmed && !snapshot.Busy {
				if len(observations) != 2 {
					t.Fatal("preflight or completion observation was not published")
				}
				return
			}
		case <-deadline:
			t.Fatal("completion readback did not publish the confirmed result and released gate")
		}
	}
}
