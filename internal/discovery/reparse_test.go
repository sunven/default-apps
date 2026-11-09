package discovery_test

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/config"
	"github.com/sunven/default-apps/internal/discovery"
	"github.com/sunven/default-apps/internal/manualassociations"
)

// The resolver represents system registrations becoming available between full
// scans. Its public responses are the only source of resolved file identities.
type reparsingSystem struct {
	system
	available           atomic.Bool
	savedInputAvailable atomic.Bool
}

func (s *reparsingSystem) ResolveExtension(ctx context.Context, value string) ([]catalog.ResolvedType, error) {
	if value == "missing" && s.savedInputAvailable.Load() {
		return s.system.ResolveExtension(ctx, "pdf")
	}
	if !s.available.Load() {
		return nil, nil
	}
	if value == "manual" {
		return []catalog.ResolvedType{{Identifier: "test.saved", Name: "Saved type", Declared: true}}, nil
	}
	if value == "shared" {
		return []catalog.ResolvedType{{Identifier: "fixture.first", Declared: true}, {Identifier: "fixture.second", Declared: true}}, nil
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
	adapter.available.Store(true)
	choices := manualassociations.New(catalog.NewService(adapter), store)
	for _, choice := range []manualassociations.Choice{
		{Kind: "extension", Value: "pdf", SelectedID: "file:com.adobe.pdf"},
		{Kind: "extension", Value: "manual", SelectedID: "file:test.saved"},
		{Kind: "scheme", Value: "manual-neighbor", SelectedID: "scheme:manual-neighbor"},
	} {
		if _, err := choices.Save(context.Background(), choice); err != nil {
			t.Fatal(err)
		}
	}
	adapter.available.Store(false)
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
	service.Reparse(before["unresolved:extension:pdf"], "common")
	refreshed := finished(t, service)
	assertReparse(t, refreshed, "common", "matched", "file:com.adobe.pdf")
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
	for _, choice := range []struct{ original, resolved string }{
		{"unresolved:identifier:test.declared", "file:test.declared"},
		{"unavailable:file:test.saved", "file:test.saved"},
	} {
		service.Reparse(before[choice.original], choice.original)
		assertReparse(t, finished(t, service), choice.original, "matched", choice.resolved)
	}
}

func assertReparse(t *testing.T, snapshot discovery.Snapshot, token, status, entryID string) {
	t.Helper()
	if snapshot.Scanning {
		t.Fatal("reparse result must accompany a completed catalog")
	}
	for _, result := range snapshot.Reparses {
		if result.Token == token {
			if result.Status != status || result.EntryID != entryID {
				t.Fatalf("reparse %s: got %+v, want %s %s", token, result, status, entryID)
			}
			if status == "matched" {
				entryByID(t, snapshot, entryID)
			}
			return
		}
	}
	t.Fatalf("missing reparse result for %s: %+v", token, snapshot.Reparses)
}

func entryByID(t *testing.T, snapshot discovery.Snapshot, id string) catalog.Entry {
	t.Helper()
	for _, entry := range snapshot.Entries {
		if entry.ID == id {
			return entry
		}
	}
	t.Fatalf("missing entry %s", id)
	return catalog.Entry{}
}

func TestReparseDistinguishesUnresolvedAmbiguousAndMissingSources(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "Reader.app")
	if err := os.Mkdir(path, 0755); err != nil {
		t.Fatal(err)
	}
	adapter := &reparsingSystem{system: system{info: map[string]any{
		"CFBundleDocumentTypes": []any{map[string]any{"CFBundleTypeExtensions": []any{"shared"}, "CFBundleTypeRole": "Viewer"}},
	}}}
	service := discovery.NewService(adapter, catalog.NewService(adapter), []string{root}, nil, nil)
	service.StartScan()
	original := entryByID(t, finished(t, service), "unresolved:extension:shared")
	service.Reparse(original, "unresolved")
	unchanged := finished(t, service)
	assertReparse(t, unchanged, "unresolved", "matched", original.ID)
	if entryByID(t, unchanged, original.ID).Resolved {
		t.Fatal("matching an unresolved entry must not make it usable")
	}
	adapter.available.Store(true)
	service.Reparse(original, "ambiguous")
	ambiguous := finished(t, service)
	assertReparse(t, ambiguous, "ambiguous", "ambiguous", "")
	entryByID(t, ambiguous, "file:fixture.first")
	entryByID(t, ambiguous, "file:fixture.second")
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	service.Reparse(original, "missing")
	assertReparse(t, finished(t, service), "missing", "missing", "")
}

func TestReparseRetainsExplicitManualIdentityAmongOtherMatches(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "Reader.app"), 0755); err != nil {
		t.Fatal(err)
	}
	adapter := &reparsingSystem{system: system{info: map[string]any{
		"CFBundleDocumentTypes": []any{map[string]any{"CFBundleTypeExtensions": []any{"shared"}, "CFBundleTypeRole": "Viewer"}},
	}}}
	store := config.NewStore(filepath.Join(t.TempDir(), "config.json"))
	adapter.available.Store(true)
	if _, err := manualassociations.New(catalog.NewService(adapter), store).Save(context.Background(), manualassociations.Choice{Kind: "extension", Value: "shared", SelectedID: "file:fixture.second"}); err != nil {
		t.Fatal(err)
	}
	adapter.available.Store(false)
	service := discovery.NewService(adapter, catalog.NewService(adapter), []string{root}, nil, store)
	service.StartScan()
	original := entryByID(t, finished(t, service), "unavailable:file:fixture.second")
	adapter.available.Store(true)
	service.Reparse(original, "selected-second")
	snapshot := finished(t, service)
	assertReparse(t, snapshot, "selected-second", "matched", "file:fixture.second")
	entryByID(t, snapshot, "file:fixture.first")
}

func TestReparsePrefersResolvedIdentityOverItsUnavailablePlaceholder(t *testing.T) {
	adapter := &reparsingSystem{}
	storePath := filepath.Join(t.TempDir(), "config.json")
	store := config.NewStore(storePath)
	adapter.savedInputAvailable.Store(true)
	if _, err := manualassociations.New(catalog.NewService(adapter), store).Save(context.Background(), manualassociations.Choice{Kind: "extension", Value: "missing", SelectedID: "file:com.adobe.pdf"}); err != nil {
		t.Fatal(err)
	}
	adapter.savedInputAvailable.Store(false)
	committed, err := os.ReadFile(storePath)
	if err != nil {
		t.Fatal(err)
	}
	service := discovery.NewService(adapter, catalog.NewService(adapter), nil, nil, store)
	service.StartScan()
	original := entryByID(t, finished(t, service), "unavailable:file:com.adobe.pdf")
	service.Reparse(original, "still-unavailable")
	assertReparse(t, finished(t, service), "still-unavailable", "matched", original.ID)
	adapter.available.Store(true)
	service.Reparse(original, "resolved-elsewhere")
	snapshot := finished(t, service)
	assertReparse(t, snapshot, "resolved-elsewhere", "matched", "file:com.adobe.pdf")
	entryByID(t, snapshot, original.ID)
	after, err := os.ReadFile(storePath)
	if err != nil || !bytes.Equal(committed, after) {
		t.Fatalf("reparse changed the saved choices: %v", err)
	}
}

func TestReparseDuringScanQueuesResultsWithTheNextCompleteCatalog(t *testing.T) {
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "Reader.app"), 0755); err != nil {
		t.Fatal(err)
	}
	blocked := make(chan struct{})
	defer func() {
		select {
		case <-blocked:
		default:
			close(blocked)
		}
	}()
	adapter := &reparsingSystem{system: system{blocked: blocked}}
	catalogService := catalog.NewService(adapter)
	entries, err := catalogService.List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	original := entryByID(t, discovery.Snapshot{Entries: entries}, "unresolved:extension:pdf")
	adapter.available.Store(true)
	events := make(chan discovery.Snapshot, 20)
	service := discovery.NewService(adapter, catalogService, []string{root}, func(value discovery.Snapshot) { events <- value }, nil)
	service.StartScan()
	for _, token := range []string{"first", "second"} {
		accepted := service.Reparse(original, token)
		if !accepted.Scanning || len(accepted.Reparses) != 0 {
			t.Fatalf("reparse completed before the blocked scan: %+v", accepted)
		}
	}
	original.Sources[0].RawInput = "caller mutation"
	close(blocked)
	completed := 0
	deadline := time.After(3 * time.Second)
	for completed < 2 {
		select {
		case snapshot := <-events:
			if snapshot.Scanning {
				if len(snapshot.Reparses) != 0 {
					t.Fatal("partial catalog carried a reparse result")
				}
				continue
			}
			completed++
			if completed == 1 {
				if len(snapshot.Reparses) != 0 {
					t.Fatal("in-flight scan answered a later reparse")
				}
				continue
			}
			for _, token := range []string{"first", "second"} {
				assertReparse(t, snapshot, token, "matched", "file:com.adobe.pdf")
			}
		case <-deadline:
			t.Fatal("queued reparse did not finish")
		}
	}
	copy := service.GetSnapshot()
	copy.Reparses[0].EntryID = "mutated"
	assertReparse(t, service.GetSnapshot(), "first", "matched", "file:com.adobe.pdf")
	if len(service.StartScan().Reparses) != 0 || len(finished(t, service).Reparses) != 0 {
		t.Fatal("an ordinary scan replayed old reparse results")
	}
}
