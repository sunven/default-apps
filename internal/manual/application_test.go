package manual_test

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/config"
	"github.com/sunven/default-apps/internal/manual"
)

type applicationAdapter struct {
	adapter
	app association.AppCopy
	err error
}

func (a applicationAdapter) ReadApplicationCopy(context.Context, string) (association.AppCopy, error) {
	return a.app, a.err
}

func TestApplicationSelectionValidatesAndSavesReadCopy(t *testing.T) {
	readError := errors.New("copy location unavailable")
	fresh := association.AppCopy{Path: "/Applications/Reader.app", DisplayPath: "/Alias.app", Name: "Fresh Reader", Version: "2", BundleID: "test.reader", IconData: "copy icon", System: true}
	for _, scenario := range []struct {
		name string
		app  association.AppCopy
		err  error
		want string
	}{
		{name: "fresh copy", app: fresh},
		{name: "unreachable", err: readError, want: readError.Error()},
		{name: "damaged metadata", app: association.AppCopy{Path: fresh.Path, MetadataError: "damaged plist"}, want: "damaged plist"},
		{name: "no canonical path", app: association.AppCopy{Name: "Reader"}, want: "所选应用不可用"},
		{name: "canonical directory is not a bundle", app: association.AppCopy{Path: "/Applications/Reader"}, want: "所选应用不可用"},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			ctx := context.Background()
			store := config.NewStore(filepath.Join(t.TempDir(), "config.json"))
			published := 0
			service := manual.NewService(catalog.NewService(adapter{}), applicationAdapter{app: scenario.app, err: scenario.err}, store, picker{app: "/Alias.app"}, func() {
				published++
				doc, err := store.Load(ctx)
				if err != nil || len(doc.Applications) != 1 || doc.Applications[0] != fresh {
					t.Errorf("notification preceded the saved copy: %+v, %v", doc, err)
				}
			})
			result, err := service.PickApplication(ctx)
			if scenario.want != "" {
				if err == nil || !strings.Contains(err.Error(), scenario.want) || result.Saved || result.App != nil || published != 0 {
					t.Fatalf("unavailable copy was accepted: %+v, %v, notifications=%d", result, err, published)
				}
				if scenario.err != nil && !errors.Is(err, scenario.err) {
					t.Fatalf("read error was not preserved: %v", err)
				}
			} else if err != nil || !result.Saved || result.App == nil || *result.App != fresh || published != 1 {
				t.Fatalf("fresh copy was not saved and returned: %+v, %v, notifications=%d", result, err, published)
			}
			doc, loadErr := store.Load(ctx)
			if loadErr != nil {
				t.Fatal(loadErr)
			}
			if scenario.want != "" && len(doc.Applications) != 0 {
				t.Fatalf("rejected copy reached configuration: %+v", doc.Applications)
			}
		})
	}
}
