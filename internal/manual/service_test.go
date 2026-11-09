package manual_test

import (
	"context"
	"errors"
	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/config"
	"github.com/sunven/default-apps/internal/discovery"
	"github.com/sunven/default-apps/internal/manual"
	"path/filepath"
	"testing"
)

type adapter struct{}

func (adapter) ResolveExtension(_ context.Context, value string) ([]catalog.ResolvedType, error) {
	if value == "jpg" {
		return []catalog.ResolvedType{{Identifier: "public.jpeg", Name: "JPEG", Declared: true}, {Identifier: "com.fixture.jpg", Name: "Other JPG", Declared: true}}, nil
	}
	return []catalog.ResolvedType{{Identifier: "dyn.unknown", Dynamic: true}}, nil
}
func (adapter) ResolveIdentifier(_ context.Context, value string) ([]catalog.ResolvedType, error) {
	return []catalog.ResolvedType{{Identifier: value, Declared: true}}, nil
}
func (adapter) ReadApplication(_ context.Context, path string) (discovery.Bundle, error) {
	return discovery.Bundle{App: association.AppCopy{Path: path, Name: "Fixture"}}, nil
}
func (adapter) IdentifyFile(_ context.Context, path string) (catalog.ResolvedType, error) {
	return catalog.ResolvedType{Identifier: "public.jpeg", Declared: true}, nil
}

type picker struct{ file, app string }

func (p picker) PickFile(context.Context) (string, error)        { return p.file, nil }
func (p picker) PickApplication(context.Context) (string, error) { return p.app, nil }
func TestAddInputRestrictsItsKindsAndPublishesOnlyAfterSaving(t *testing.T) {
	ctx := context.Background()
	store := config.NewStore(filepath.Join(t.TempDir(), "config.json"))
	published := 0
	service := manual.NewService(catalog.NewService(adapter{}), adapter{}, store, picker{}, func() {
		published++
		doc, err := store.Load(ctx)
		if err != nil || len(doc.Associations) != 1 {
			t.Errorf("notification preceded the commit: %+v, %v", doc, err)
		}
	})
	resolution, err := service.ResolveInput(ctx, "extension", " .JPG ")
	if err != nil || len(resolution.Entries) != 2 {
		t.Fatalf("ambiguity lost: %#v %v", resolution, err)
	}
	if result, err := service.AddInput(ctx, "identifier", "public.jpeg", "file:public.jpeg"); err == nil || result.Saved || published != 0 {
		t.Fatalf("input entry point accepted a file-identifier choice: %+v, %v", result, err)
	}
	for i := 0; i < 2; i++ {
		result, err := service.AddInput(ctx, "extension", ".JPG", "file:public.jpeg")
		if err != nil || !result.Saved || result.Entry == nil || result.Entry.ID != "file:public.jpeg" {
			t.Fatalf("committed choice did not reach the bridge: %+v, %v", result, err)
		}
	}
	if published != 2 || service.GetStatus(ctx).Associations != 1 {
		t.Fatalf("duplicate save changed notifications or persisted count: %d", published)
	}
}

func TestSchemeNormalizationAndCancelledPickersHaveNoPersistenceEffects(t *testing.T) {
	ctx := context.Background()
	store := config.NewStore(filepath.Join(t.TempDir(), "config.json"))
	service := manual.NewService(catalog.NewService(adapter{}), adapter{}, store, picker{}, nil)
	resolution, err := service.ResolveInput(ctx, "scheme", " My+Scheme: ")
	if err != nil || len(resolution.Entries) != 1 || resolution.Entries[0].ID != "scheme:my+scheme" {
		t.Fatalf("wrong scheme: %#v %v", resolution, err)
	}
	if _, err := service.AddInput(ctx, "scheme", "My+Scheme:", "scheme:my+scheme"); err != nil {
		t.Fatal(err)
	}
	file, err := service.IdentifyFile(ctx)
	if err != nil || !file.Cancelled {
		t.Fatalf("file cancel: %#v %v", file, err)
	}
	app, err := service.PickApplication(ctx)
	if err != nil || !app.Cancelled || app.Saved {
		t.Fatalf("app cancel: %#v %v", app, err)
	}
	doc, err := store.Load(ctx)
	if err != nil || len(doc.Associations) != 1 || len(doc.Applications) != 0 {
		t.Fatalf("cancel mutated config: %#v %v", doc, err)
	}
}

func TestFileIdentificationDoesNotSaveUntilConfirmed(t *testing.T) {
	ctx := context.Background()
	store := config.NewStore(filepath.Join(t.TempDir(), "config.json"))
	service := manual.NewService(catalog.NewService(adapter{}), adapter{}, store, picker{file: "/a.jpg"}, nil)
	file, err := service.IdentifyFile(ctx)
	if err != nil || file.Entries[0].Association.Key != "public.jpeg" {
		t.Fatalf("file type: %#v %v", file, err)
	}
	if service.GetStatus(ctx).Associations != 0 {
		t.Fatal("picker silently saved type")
	}
	if _, err := service.AddIdentifiedType(ctx, "public.jpeg"); err != nil {
		t.Fatal(err)
	}
	if service.GetStatus(ctx).Associations != 1 {
		t.Fatal("confirmed file identity not saved")
	}
}

type canonicalAdapter struct{ adapter }

func (canonicalAdapter) ReadApplication(_ context.Context, path string) (discovery.Bundle, error) {
	if path == "/alias.app" {
		path = "/one/Copy.app"
	}
	return discovery.Bundle{App: association.AppCopy{Path: path, Name: "Copy", BundleID: "fixture.same"}}, nil
}
func TestManualApplicationsMergeCanonicalAliasesButKeepSeparateCopies(t *testing.T) {
	ctx := context.Background()
	store := config.NewStore(filepath.Join(t.TempDir(), "config.json"))
	for _, path := range []string{"/one/Copy.app", "/alias.app", "/two/Copy.app"} {
		service := manual.NewService(catalog.NewService(adapter{}), canonicalAdapter{}, store, picker{app: path}, nil)
		result, err := service.PickApplication(ctx)
		if err != nil || !result.Saved {
			t.Fatalf("application selection: %#v %v", result, err)
		}
	}
	doc, _ := store.Load(ctx)
	if len(doc.Applications) != 2 || doc.Applications[0].Path != "/one/Copy.app" || doc.Applications[1].Path != "/two/Copy.app" {
		t.Fatalf("copies conflated: %#v", doc.Applications)
	}
}

func TestSaveFailureIsReportedWithoutPublishingSavedItems(t *testing.T) {
	ctx := context.Background()
	store := config.NewStoreWithWriter(filepath.Join(t.TempDir(), "config.json"), func(string, []byte) error { return errors.New("disk full") })
	published := false
	service := manual.NewService(catalog.NewService(adapter{}), adapter{}, store, picker{app: "/Copy.app"}, func() { published = true })
	result, err := service.AddInput(ctx, "scheme", "fixture", "scheme:fixture")
	if err == nil || result.Saved || published {
		t.Fatalf("failed association save appeared committed: %#v %v", result, err)
	}
	result, err = service.PickApplication(ctx)
	if err == nil || result.Saved || published {
		t.Fatalf("failed application save appeared committed: %#v %v", result, err)
	}
	doc, _ := store.Load(ctx)
	if len(doc.Associations) != 0 || len(doc.Applications) != 0 {
		t.Fatal("failed save mutated configuration")
	}
}

func TestApplicationPickerRejectsAnOrdinaryDirectory(t *testing.T) {
	store := config.NewStore(filepath.Join(t.TempDir(), "config.json"))
	service := manual.NewService(catalog.NewService(adapter{}), adapter{}, store, picker{app: "/ordinary-folder"}, nil)
	result, err := service.PickApplication(context.Background())
	if err == nil || result.Saved {
		t.Fatalf("ordinary folder accepted as application: %#v %v", result, err)
	}
}
