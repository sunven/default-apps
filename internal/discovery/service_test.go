package discovery_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/config"
	"github.com/sunven/default-apps/internal/discovery"
)

type system struct {
	blocked chan struct{}
	info    map[string]any
	denied  string
}

func (s system) ResolveExtension(_ context.Context, value string) ([]catalog.ResolvedType, error) {
	if value == "pdf" {
		return []catalog.ResolvedType{{Identifier: "com.adobe.pdf", Name: "PDF", Declared: true, Extensions: []string{"pdf"}}}, nil
	}
	return nil, nil
}
func (s system) ResolveIdentifier(_ context.Context, value string) ([]catalog.ResolvedType, error) {
	if value == "com.adobe.pdf" {
		return s.ResolveExtension(context.Background(), "pdf")
	}
	return nil, nil
}
func (s system) ReadApplication(ctx context.Context, path string) (discovery.Bundle, error) {
	if path == s.denied {
		return discovery.Bundle{}, errors.New("permission denied")
	}
	if s.blocked != nil {
		<-s.blocked
	}
	canonical, err := filepath.EvalSymlinks(path)
	return discovery.Bundle{App: association.AppCopy{Path: canonical, DisplayPath: path, Name: "Reader", Version: "1", BundleID: "test.reader"}, Info: s.info}, err
}

func TestPartialDiscoveryProblemsPreserveUsableAppsAndNeighboringDeclarations(t *testing.T) {
	root := t.TempDir()
	for _, name := range []string{"Reader.app", "Denied.app"} {
		if err := os.Mkdir(filepath.Join(root, name), 0755); err != nil {
			t.Fatal(err)
		}
	}
	adapter := system{denied: filepath.Join(root, "Denied.app"), info: map[string]any{"CFBundleDocumentTypes": []any{
		"broken dictionary",
		map[string]any{"LSItemContentTypes": 42, "CFBundleTypeExtensions": []any{"pdf"}, "CFBundleTypeRole": "Viewer"},
		map[string]any{"CFBundleTypeExtensions": []any{"pdf", true, "*"}, "CFBundleTypeRole": "Viewer"},
	}}}
	service := discovery.NewService(adapter, catalog.NewService(adapter), []string{root, filepath.Join(root, "Missing")}, nil)
	service.StartScan()
	snapshot := finished(t, service)
	if len(snapshot.Apps) != 1 || len(snapshot.Issues) < 4 {
		t.Fatalf("partial problems must accompany usable apps: %+v", snapshot)
	}
	if snapshot.Apps[0].Declarations[0].Origin != "CFBundleDocumentTypes[1]" {
		t.Fatalf("malformed neighbor shifted declaration provenance: %s", snapshot.Apps[0].Declarations[0].Origin)
	}
	foundPDF := false
	unresolved := 0
	for _, id := range snapshot.Apps[0].AssociationIDs {
		if id == "file:com.adobe.pdf" {
			foundPDF = true
		}
		if len(id) > 11 && id[:11] == "unresolved:" {
			unresolved++
		}
	}
	if !foundPDF || unresolved != 2 {
		t.Fatalf("valid neighbor and both invalid declarations must survive: %v", snapshot.Apps[0].AssociationIDs)
	}
	snapshot.Apps[0].App.Name = "mutated"
	snapshot.Entries[0].Sources[0].Kind = "mutated"
	fresh := service.GetSnapshot()
	if fresh.Apps[0].App.Name == "mutated" || fresh.Entries[0].Sources[0].Kind == "mutated" {
		t.Fatal("caller changed authoritative snapshot")
	}
}

func TestPublishedProgressSnapshotRemainsImmutableAfterLaterScanSorting(t *testing.T) {
	root := t.TempDir()
	for i := 0; i < 14; i++ {
		if err := os.Mkdir(filepath.Join(root, fmt.Sprintf("%02d.app", i)), 0755); err != nil {
			t.Fatal(err)
		}
	}
	adapter := orderedSystem{system: system{}}
	received := make(chan discovery.Snapshot, 20)
	service := discovery.NewService(adapter, catalog.NewService(adapter), []string{root}, func(value discovery.Snapshot) { received <- value })
	service.StartScan()
	finished(t, service)
	<-received // common entries
	partial := <-received
	if len(partial.Apps) != 10 {
		t.Fatalf("expected progress after ten apps: %d", len(partial.Apps))
	}
	if filepath.Base(partial.Apps[0].App.Path) != "00.app" {
		t.Fatalf("published snapshot mutated after final sorting: %s", partial.Apps[0].App.Path)
	}
}

type orderedSystem struct{ system }

func (s orderedSystem) ReadApplication(ctx context.Context, path string) (discovery.Bundle, error) {
	bundle, err := s.system.ReadApplication(ctx, path)
	if filepath.Base(path) == "00.app" {
		bundle.App.Name = "Z last"
	} else {
		bundle.App.Name = "A first"
	}
	return bundle, err
}

func TestDeclarationsMergeCommonIdentityButDoNotInferSupportFromDefinitionsOrLegacyTags(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "Reader.app"), 0755); err != nil {
		t.Fatal(err)
	}
	adapter := system{info: map[string]any{
		"UTExportedTypeDeclarations": []any{map[string]any{"UTTypeIdentifier": "test.private", "UTTypeDescription": "Private data"}},
		"CFBundleDocumentTypes": []any{
			map[string]any{"LSItemContentTypes": []any{"com.adobe.pdf", "test.unregistered"}, "CFBundleTypeExtensions": []any{"unrelated"}, "CFBundleTypeRole": "Viewer"},
			map[string]any{"LSItemContentTypes": []any{"test.info"}, "CFBundleTypeRole": "None"},
			map[string]any{"LSItemContentTypes": []any{"test.drop"}, "CFBundleTypeRole": "Editor", "LSHandlerRank": "None"},
		},
		"CFBundleURLTypes": []any{map[string]any{"CFBundleURLSchemes": []any{"HTTPS"}, "CFBundleURLName": "not-a-scheme"}},
	}}
	service := discovery.NewService(adapter, catalog.NewService(adapter), []string{root}, nil)
	service.StartScan()
	snapshot := finished(t, service)
	app := snapshot.Apps[0]
	if len(app.AssociationIDs) != 3 {
		t.Fatalf("want PDF, unresolved identifier and https only; got %v", app.AssociationIDs)
	}
	var pdf, unknown *catalog.Entry
	for i := range snapshot.Entries {
		entry := &snapshot.Entries[i]
		if entry.ID == "file:com.adobe.pdf" {
			pdf = entry
		}
		if entry.ID == "unresolved:identifier:test.unregistered" {
			unknown = entry
		}
	}
	if pdf == nil || len(pdf.Sources) != 2 || pdf.Sources[0].Kind != "common" || pdf.Sources[1].AppPath != app.App.Path {
		t.Fatalf("missing merged provenance: %+v", pdf)
	}
	if unknown == nil || unknown.Resolved || unknown.Sources[0].RawInput != "test.unregistered" {
		t.Fatalf("unknown declaration must stay identifiable: %+v", unknown)
	}
}
func finished(t *testing.T, s *discovery.Service) discovery.Snapshot {
	t.Helper()
	deadline := time.After(3 * time.Second)
	for {
		snapshot := s.GetSnapshot()
		if !snapshot.Scanning {
			return snapshot
		}
		select {
		case <-deadline:
			t.Fatal("background scan did not finish")
		case <-time.After(time.Millisecond):
		}
	}
}
func TestBackgroundScanKeepsNestedCopiesAndStopsAtBundlesAndDirectoryLinks(t *testing.T) {
	root := t.TempDir()
	for _, path := range []string{"Reader.app/Contents/Helper.app", "Tools/Reader.app", "Other"} {
		if err := os.MkdirAll(filepath.Join(root, path), 0755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Symlink(root, filepath.Join(root, "Other/loop")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(root, "Reader.app"), filepath.Join(root, "Alias.app")); err != nil {
		t.Fatal(err)
	}
	blocked := make(chan struct{})
	adapter := system{blocked: blocked}
	service := discovery.NewService(adapter, catalog.NewService(adapter), []string{root}, nil)
	started := service.StartScan()
	if !started.Scanning {
		t.Fatal("scan must return before blocked filesystem work completes")
	}
	close(blocked)
	snapshot := finished(t, service)
	if len(snapshot.Apps) != 2 {
		t.Fatalf("want two installed copies, no helper or link duplicate; got %+v", snapshot.Apps)
	}
	if snapshot.Apps[0].App.Path == snapshot.Apps[1].App.Path {
		t.Fatal("different installed copies merged")
	}
}

func TestManualItemsRejoinCatalogOnRestartAndUnavailableCopiesKeepOriginalPath(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "Outside.app")
	if err := os.Mkdir(path, 0755); err != nil {
		t.Fatal(err)
	}
	path, _ = filepath.EvalSymlinks(path)
	storePath := filepath.Join(t.TempDir(), "config.json")
	store := config.NewStore(storePath)
	if err := store.Update(context.Background(), func(doc *config.Document) error {
		doc.Associations = append(doc.Associations, config.ManualAssociation{Input: catalog.Input{Kind: "extension", Value: ".PDF", Source: "manual"}, SelectedID: "file:com.adobe.pdf"})
		doc.Applications = append(doc.Applications, association.AppCopy{Path: path, DisplayPath: path, Name: "Saved Reader", BundleID: "test.reader"})
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	adapter := system{}
	reopened := discovery.NewService(adapter, catalog.NewService(adapter), nil, nil, config.NewStore(storePath))
	reopened.StartScan()
	snapshot := finished(t, reopened)
	if len(snapshot.Apps) != 1 || !snapshot.Apps[0].Manual || snapshot.Apps[0].Unavailable {
		t.Fatalf("manual copy absent: %#v", snapshot.Apps)
	}
	var pdf catalog.Entry
	for _, entry := range snapshot.Entries {
		if entry.ID == "file:com.adobe.pdf" {
			pdf = entry
		}
	}
	if len(pdf.Sources) != 2 || pdf.Sources[0].Kind != "common" || pdf.Sources[1].Kind != "manual" {
		t.Fatalf("sources did not merge: %#v", pdf)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	missing := discovery.NewService(adapter, catalog.NewService(adapter), nil, nil, config.NewStore(storePath))
	missing.StartScan()
	snapshot = finished(t, missing)
	if len(snapshot.Apps) != 1 || !snapshot.Apps[0].Unavailable || snapshot.Apps[0].App.Path != path || len(snapshot.Apps[0].AssociationIDs) != 0 {
		t.Fatalf("missing copy replaced or hidden: %#v", snapshot.Apps)
	}
	saved, err := store.Load(context.Background())
	if err != nil || len(saved.Applications) != 1 || saved.Applications[0].Path != path {
		t.Fatalf("missing copy configuration lost: %#v %v", saved, err)
	}
}

func TestSavedManualChoiceDoesNotExpandIntoOtherAmbiguousTypes(t *testing.T) {
	store := config.NewStore(filepath.Join(t.TempDir(), "config.json"))
	if err := store.Update(context.Background(), func(doc *config.Document) error {
		doc.Associations = []config.ManualAssociation{{Input: catalog.Input{Kind: "extension", Value: "shared", Source: "manual"}, SelectedID: "file:fixture.second"}}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	adapter := ambiguousSystem{}
	service := discovery.NewService(adapter, catalog.NewService(adapter), nil, nil, store)
	service.StartScan()
	snapshot := finished(t, service)
	found := false
	for _, entry := range snapshot.Entries {
		if entry.ID == "file:fixture.first" {
			t.Fatal("unselected ambiguous type was restored")
		}
		if entry.ID == "file:fixture.second" {
			found = true
		}
	}
	if !found {
		t.Fatal("selected ambiguous type was not restored")
	}
}

type ambiguousSystem struct{ system }

func (ambiguousSystem) ResolveExtension(ctx context.Context, value string) ([]catalog.ResolvedType, error) {
	if value == "shared" {
		return []catalog.ResolvedType{{Identifier: "fixture.first", Declared: true}, {Identifier: "fixture.second", Declared: true}}, nil
	}
	return system{}.ResolveExtension(ctx, value)
}

func TestReappearingManualCopyBecomesAvailableWithoutLosingSavedIdentity(t *testing.T) {
	parent, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(parent, "Outside.app")
	store := config.NewStore(filepath.Join(t.TempDir(), "config.json"))
	if err := store.Update(context.Background(), func(doc *config.Document) error {
		doc.Applications = []association.AppCopy{{Path: path, DisplayPath: path, Name: "Saved"}}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	service := discovery.NewService(system{}, catalog.NewService(system{}), nil, nil, store)
	service.StartScan()
	missing := finished(t, service)
	if !missing.Apps[0].Unavailable {
		t.Fatal("missing copy was usable")
	}
	if err := os.Mkdir(path, 0755); err != nil {
		t.Fatal(err)
	}
	service.StartScan()
	restored := finished(t, service)
	if restored.Apps[0].Unavailable || restored.Apps[0].App.Path != path {
		t.Fatalf("reappearing copy not restored: %#v", restored.Apps)
	}
}

func TestCorruptManualConfigurationReportsIssueWhileCommonCatalogRemainsUsable(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(path, []byte("{broken"), 0600); err != nil {
		t.Fatal(err)
	}
	service := discovery.NewService(system{}, catalog.NewService(system{}), nil, nil, config.NewStore(path))
	service.StartScan()
	snapshot := finished(t, service)
	if len(snapshot.Entries) == 0 || len(snapshot.Issues) != 1 || snapshot.Issues[0].Origin != "configuration" {
		t.Fatalf("corruption hidden or valid catalog lost: %#v", snapshot)
	}
	after, _ := os.ReadFile(path)
	if string(after) != "{broken" {
		t.Fatal("discovery overwrote corrupt config")
	}
}

func TestManualApplicationWithUnreadableMetadataIsUnavailable(t *testing.T) {
	store := config.NewStore(filepath.Join(t.TempDir(), "config.json"))
	if err := store.Update(context.Background(), func(doc *config.Document) error {
		doc.Applications = []association.AppCopy{{Path: "/Outside/Broken.app", Name: "Saved Copy"}}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	adapter := unreadableManualSystem{}
	service := discovery.NewService(adapter, catalog.NewService(adapter), nil, nil, store)
	service.StartScan()
	snapshot := finished(t, service)
	if len(snapshot.Apps) != 1 || !snapshot.Apps[0].Unavailable || snapshot.Apps[0].App.Path != "/Outside/Broken.app" || snapshot.Apps[0].App.MetadataError != "unreadable plist" {
		t.Fatalf("unreadable saved copy presented as usable: %#v", snapshot.Apps)
	}
}

type unreadableManualSystem struct{ system }

func (unreadableManualSystem) ReadApplication(_ context.Context, path string) (discovery.Bundle, error) {
	return discovery.Bundle{App: association.AppCopy{Path: path, MetadataError: "unreadable plist"}}, nil
}
