package change_test

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/change"
	"github.com/sunven/default-apps/internal/config"
)

type applicationReader struct {
	app  association.AppCopy
	err  error
	path string
}

func (r *applicationReader) ReadApplicationCopy(_ context.Context, path string) (association.AppCopy, error) {
	r.path = path
	return r.app, r.err
}

func TestSubmitValidatesAndPersistsTheExactReadCopy(t *testing.T) {
	fresh := target
	fresh.DisplayPath = "/Alias.app"
	fresh.Name, fresh.Version, fresh.BundleID = "Fresh Target", "2", "test.updated"
	fresh.IconData, fresh.System = "copy icon", true
	for _, scenario := range []struct {
		name     string
		app      association.AppCopy
		err      error
		accepted bool
	}{
		{name: "fresh exact copy", app: fresh, accepted: true},
		{name: "unreachable", err: errors.New("copy location unavailable")},
		{name: "damaged metadata", app: association.AppCopy{Path: target.Path, MetadataError: "damaged plist"}},
		{name: "no canonical path", app: association.AppCopy{Name: target.Name}},
		{name: "different copy of same application", app: association.AppCopy{Path: "/Other/Target.app", BundleID: target.BundleID}},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			store := config.NewStore(filepath.Join(t.TempDir(), "config.json"))
			sys := &system{current: &old, start: make(chan struct{}, 1), store: store}
			reader := &applicationReader{app: scenario.app, err: scenario.err}
			service := change.NewService(catalog.NewService(sys), association.NewService(sys), reader, store, sys, change.Options{WritableKinds: []string{"file"}})
			result := service.Submit(ctx, input("read-copy"))
			if reader.path != target.Path {
				t.Fatalf("reader did not inspect the selected path: %q", reader.path)
			}
			if scenario.accepted {
				if result.Outcome != "accepted" || result.Request == nil || result.Request.Target != fresh {
					t.Fatalf("fresh exact copy was not accepted: %+v", result)
				}
				waitStart(t, sys)
				var pending change.PendingRecord
				if err := json.Unmarshal(sys.pendingAtStart.Pending, &pending); err != nil || pending.Target != fresh {
					t.Fatalf("dispatch did not observe the persisted fresh copy: %+v, %v", pending, err)
				}
			} else {
				if result.Outcome != "target_unavailable" || result.Request != nil || sys.starts != 0 {
					t.Fatalf("unavailable or different copy was admitted: %+v, starts=%d", result, sys.starts)
				}
				if scenario.err != nil && result.Message != scenario.err.Error() {
					t.Fatalf("read error message changed: %q", result.Message)
				}
				doc, err := store.Load(ctx)
				if err != nil || len(doc.Pending) != 0 {
					t.Fatalf("rejected copy reached durable pending state: %+v, %v", doc, err)
				}
			}
		})
	}
}
