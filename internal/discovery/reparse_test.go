package discovery_test

import (
	"context"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"

	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/config"
	"github.com/sunven/default-apps/internal/discovery"
)

// The resolver represents system registrations becoming available between full
// scans. Its public responses are the only source of resolved file identities.
type reparsingSystem struct {
	system
	available atomic.Bool
}

func (s *reparsingSystem) ResolveExtension(ctx context.Context, value string) ([]catalog.ResolvedType, error) {
	if !s.available.Load() {
		return nil, nil
	}
	if value == "manual" {
		return []catalog.ResolvedType{{Identifier: "test.saved", Name: "Saved type", Declared: true}}, nil
	}
	return s.system.ResolveExtension(ctx, value)
}
func (s *reparsingSystem) ResolveIdentifier(ctx context.Context, value string) ([]catalog.ResolvedType, error) {
	if !s.available.Load() {
		return nil, nil
	}
	if value == "test.declared" {
		return []catalog.ResolvedType{{Identifier: value, Name: "Declared type", Declared: true}}, nil
	}
	return s.system.ResolveIdentifier(ctx, value)
}

func TestFullRescanReparsesCommonDeclaredAndSavedInputsWithoutLosingSources(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "Reader.app"), 0755); err != nil {
		t.Fatal(err)
	}
	adapter := &reparsingSystem{system: system{info: map[string]any{
		"CFBundleDocumentTypes": []any{map[string]any{"LSItemContentTypes": []any{"com.adobe.pdf", "test.declared"}, "CFBundleTypeRole": "Viewer"}},
	}}}
	store := config.NewStore(filepath.Join(t.TempDir(), "config.json"))
	if err := store.Update(context.Background(), func(doc *config.Document) error {
		doc.Associations = []config.ManualAssociation{
			{Input: catalog.Input{Kind: "extension", Value: "pdf", Source: "manual"}, SelectedID: "file:com.adobe.pdf"},
			{Input: catalog.Input{Kind: "extension", Value: "manual", Source: "manual"}, SelectedID: "file:test.saved"},
			{Input: catalog.Input{Kind: "scheme", Value: "manual-neighbor", Source: "manual"}, SelectedID: "scheme:manual-neighbor"},
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	service := discovery.NewService(adapter, catalog.NewService(adapter), []string{root}, nil, store)
	service.StartScan()
	initial := finished(t, service)
	indexed := func(snapshot discovery.Snapshot) map[string]catalog.Entry {
		entries := map[string]catalog.Entry{}
		for _, entry := range snapshot.Entries {
			entries[entry.ID] = entry
		}
		return entries
	}
	before := indexed(initial)
	for _, id := range []string{"unresolved:extension:pdf", "unresolved:identifier:test.declared", "unavailable:file:test.saved"} {
		if entry, ok := before[id]; !ok || entry.Resolved {
			t.Fatalf("expected unresolved input %s: %+v", id, entry)
		}
	}
	adapter.available.Store(true)
	service.StartScan()
	refreshed := finished(t, service)
	if refreshed.Version <= initial.Version {
		t.Fatal("completed reparse did not advance the catalog version")
	}
	after := indexed(refreshed)
	for _, id := range []string{"file:com.adobe.pdf", "file:test.declared", "file:test.saved", "scheme:https", "scheme:manual-neighbor"} {
		if entry, ok := after[id]; !ok || !entry.Resolved {
			t.Fatalf("reparse lost or failed to resolve %s: %+v", id, entry)
		}
	}
	for _, id := range []string{"unresolved:extension:pdf", "unresolved:identifier:test.declared", "unavailable:file:test.saved"} {
		if _, ok := after[id]; ok {
			t.Fatalf("completed reparse retained obsolete unresolved input %s", id)
		}
	}
	sources := map[string]bool{}
	for _, source := range after["file:com.adobe.pdf"].Sources {
		sources[source.Kind] = true
	}
	for _, kind := range []string{"common", "declaration", "manual"} {
		if !sources[kind] {
			t.Fatalf("resolved PDF lost %s provenance: %+v", kind, after["file:com.adobe.pdf"].Sources)
		}
	}
	if after["file:test.declared"].Sources[0].AppPath != refreshed.Apps[0].App.Path || after["file:test.saved"].Sources[0].Kind != "manual" {
		t.Fatalf("independent declaration/manual provenance changed: %+v", refreshed.Entries)
	}
}
