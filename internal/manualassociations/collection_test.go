package manualassociations_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"testing"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/config"
	"github.com/sunven/default-apps/internal/manualassociations"
)

type resolver struct {
	extensions  map[string][]catalog.ResolvedType
	identifiers map[string][]catalog.ResolvedType
	failing     string
	onResolve   func()
}

func types() *resolver {
	first := catalog.ResolvedType{Identifier: "test.first", Name: "First", Declared: true}
	second := catalog.ResolvedType{Identifier: "test.second", Name: "Second", Declared: true}
	return &resolver{
		extensions:  map[string][]catalog.ResolvedType{"jpg": {first, second}, "shared": {first, second}, "test.second": {second}},
		identifiers: map[string][]catalog.ResolvedType{"test.second": {second}, "mismatch": {first}},
	}
}

func (r *resolver) ResolveExtension(_ context.Context, value string) ([]catalog.ResolvedType, error) {
	if r.onResolve != nil {
		r.onResolve()
	}
	if value == r.failing {
		return nil, errors.New("registration unavailable")
	}
	return r.extensions[value], nil
}

func (r *resolver) ResolveIdentifier(_ context.Context, value string) ([]catalog.ResolvedType, error) {
	return r.identifiers[value], nil
}

func save(t *testing.T, choices *manualassociations.Collection, choice manualassociations.Choice) catalog.Entry {
	t.Helper()
	entry, err := choices.Save(context.Background(), choice)
	if err != nil {
		t.Fatal(err)
	}
	return entry
}

func restore(t *testing.T, choices *manualassociations.Collection) manualassociations.Restoration {
	t.Helper()
	result, err := choices.Restore(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func fileBytes(t *testing.T, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestSaveAndReopenRestoreOnlyTheConfirmedIdentity(t *testing.T) {
	for _, test := range []struct {
		choice manualassociations.Choice
		id     string
		origin string
	}{
		{manualassociations.Choice{Kind: "extension", Value: " .JPG ", SelectedID: "file:test.second"}, "file:test.second", ""},
		{manualassociations.Choice{Kind: "scheme", Value: " My+Scheme: ", SelectedID: "scheme:my+scheme"}, "scheme:my+scheme", ""},
		{manualassociations.Choice{Kind: "identifier", Value: "test.second"}, "file:test.second", "file"},
	} {
		t.Run(test.choice.Kind, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "config.json")
			catalogService := catalog.NewService(types())
			entry := save(t, manualassociations.New(catalogService, config.NewStore(path)), test.choice)
			result := restore(t, manualassociations.New(catalogService, config.NewStore(path)))
			if entry.ID != test.id || len(result.Entries) != 1 || result.Entries[0].ID != test.id || !result.Entries[0].Resolved || len(result.Problems) != 0 {
				t.Fatalf("chosen identity did not survive reopening: %+v", result)
			}
			source := result.Entries[0].Sources[0]
			if source.Kind != "manual" || source.InputKind != test.choice.Kind || source.RawInput != test.choice.Value || source.Origin != test.origin {
				t.Fatalf("saved input lost its provenance: %+v", source)
			}
		})
	}
}

func TestSaveRejectsChoicesOutsideTheCurrentResolution(t *testing.T) {
	for _, choice := range []manualassociations.Choice{
		{Kind: "mime", Value: "image/jpeg", SelectedID: "file:test.second"},
		{Kind: "extension", Value: "jpg"},
		{Kind: "extension", Value: "jpg", SelectedID: "file:invented"},
		{Kind: "extension", Value: "unknown", SelectedID: "unresolved:extension:unknown"},
		{Kind: "identifier", Value: "unknown"},
		{Kind: "identifier", Value: "mismatch"},
	} {
		t.Run(choice.Kind+":"+choice.Value+":"+choice.SelectedID, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "config.json")
			choices := manualassociations.New(catalog.NewService(types()), config.NewStore(path))
			entry, err := choices.Save(context.Background(), choice)
			if err == nil || entry.ID != "" {
				t.Fatalf("invalid choice appeared saved: %+v, %v", entry, err)
			}
			if len(restore(t, choices).Entries) != 0 {
				t.Fatal("rejected choice was persisted")
			}
		})
	}
}

func TestSaveRechecksAChoiceAfterPreview(t *testing.T) {
	r := types()
	catalogService := catalog.NewService(r)
	preview, err := catalogService.Resolve(context.Background(), []catalog.Input{{Kind: "extension", Value: "jpg"}})
	if err != nil || len(preview) != 2 {
		t.Fatalf("preview unavailable: %+v, %v", preview, err)
	}
	r.extensions["jpg"] = r.extensions["jpg"][:1]
	choices := manualassociations.New(catalogService, config.NewStore(filepath.Join(t.TempDir(), "config.json")))
	if _, err := choices.Save(context.Background(), manualassociations.Choice{Kind: "extension", Value: "jpg", SelectedID: preview[1].ID}); err == nil {
		t.Fatal("a stale preview was accepted without rechecking")
	}
	if len(restore(t, choices).Entries) != 0 {
		t.Fatal("stale choice was persisted")
	}
}

func TestDuplicateSavesRetainTheFirstInputAndReturnTheCurrentEntry(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	writes := 0
	store := config.NewStoreWithWriter(path, func(path string, data []byte) error {
		writes++
		return config.AtomicWrite(path, data)
	})
	r := types()
	choices := manualassociations.New(catalog.NewService(r), store)
	save(t, choices, manualassociations.Choice{Kind: "extension", Value: " .JPG ", SelectedID: "file:test.second"})
	r.extensions["jpg"][1].Name = "Current name"
	duplicate := save(t, choices, manualassociations.Choice{Kind: "extension", Value: ".jpg", SelectedID: "file:test.second"})
	if duplicate.Name != "Current name" || duplicate.Sources[0].RawInput != ".jpg" {
		t.Fatalf("duplicate returned the old resolution: %+v", duplicate)
	}
	for _, choice := range []manualassociations.Choice{
		{Kind: "extension", Value: "jpg", SelectedID: "file:test.second"},
		{Kind: "extension", Value: "jpg", SelectedID: "file:test.first"},
		{Kind: "extension", Value: "test.second", SelectedID: "file:test.second"},
		{Kind: "identifier", Value: "test.second"},
	} {
		save(t, choices, choice)
	}
	result := restore(t, manualassociations.New(catalog.NewService(r), config.NewStore(path)))
	if writes != 6 || len(result.Entries) != 2 || result.Entries[0].ID != "file:test.second" || result.Entries[1].ID != "file:test.first" {
		t.Fatalf("deduplication changed the commit or identity ordering: %d, %+v", writes, result)
	}
	sources := result.Entries[0].Sources
	if len(sources) != 4 || sources[0].RawInput != " .JPG " || sources[1].RawInput != "jpg" || sources[2].InputKind != "extension" || sources[3].InputKind != "identifier" {
		t.Fatalf("deduplication changed the raw-input or input-kind rules: %+v", sources)
	}
}

func TestRestoreRetainsUnavailableIdentityUntilItReturnsWithoutWriting(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	r := types()
	save(t, manualassociations.New(catalog.NewService(r), config.NewStore(path)), manualassociations.Choice{Kind: "extension", Value: "shared", SelectedID: "file:test.second"})
	committed := fileBytes(t, path)
	r.extensions["shared"] = r.extensions["shared"][:1]
	choices := manualassociations.New(catalog.NewService(r), config.NewStore(path))
	missing := restore(t, choices)
	want := catalog.Entry{
		ID: "unavailable:file:test.second", Association: association.Association{Kind: "file"}, Name: "shared",
		Extensions: []string{}, MIMETypes: []string{}, Sources: []catalog.Source{{Kind: "manual", InputKind: "extension", RawInput: "shared"}},
		UnresolvedReason: "先前选择的类型现在无法解析：file:test.second", DiagnosticIdentifiers: []string{"file:test.second"},
	}
	if len(missing.Entries) != 1 || !reflect.DeepEqual(missing.Entries[0], want) || len(missing.Problems) != 0 {
		t.Fatalf("missing identity was replaced or its placeholder changed: %+v", missing)
	}
	r.extensions["shared"] = types().extensions["shared"]
	returned := restore(t, choices)
	if len(returned.Entries) != 1 || returned.Entries[0].ID != "file:test.second" || !returned.Entries[0].Resolved {
		t.Fatalf("restoration did not recheck the chosen identity: %+v", returned)
	}
	if !bytes.Equal(committed, fileBytes(t, path)) {
		t.Fatal("restoration modified the saved choices")
	}
}

func TestResolverFailureKeepsThePlaceholderEvenWhenAnotherSavedInputProvidesItsIdentity(t *testing.T) {
	r := types()
	choices := manualassociations.New(catalog.NewService(r), config.NewStore(filepath.Join(t.TempDir(), "config.json")))
	for _, value := range []string{"jpg", "shared"} {
		save(t, choices, manualassociations.Choice{Kind: "extension", Value: value, SelectedID: "file:test.second"})
	}
	r.failing = "jpg"
	result := restore(t, choices)
	if len(result.Entries) != 2 || result.Entries[0].ID != "unavailable:file:test.second" || result.Entries[1].ID != "file:test.second" || len(result.Problems) != 0 {
		t.Fatalf("resolver failure was treated as a load error or removed a placeholder: %+v", result)
	}
}

type countedRepository struct {
	config.Repository
	reads int
}

func (r *countedRepository) Load(ctx context.Context) (config.Document, error) {
	r.reads++
	return r.Repository.Load(ctx)
}

func TestRestoreReadsAssociationsAndApplicationsFromOneLegacyDocument(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	raw := []byte(`{"version":1,"associations":[{"input":{"kind":"identifier","value":"test.second","label":"test.second","source":"manual","origin":"file"},"selectedID":"file:test.second"}],"applications":[{"path":"/Outside/Copy.app","name":"Saved copy"}],"pending":{"requestID":"original","opaqueField":true}}`)
	if err := os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}
	store := &countedRepository{Repository: config.NewStore(path)}
	choices := manualassociations.New(catalog.NewService(types()), store)
	save(t, choices, manualassociations.Choice{Kind: "scheme", Value: "fixture", SelectedID: "scheme:fixture"})
	result := restore(t, choices)
	if store.reads != 1 || len(result.Entries) != 2 || result.Entries[0].Sources[0].Origin != "file" || len(result.Applications) != 1 || result.Applications[0].Path != "/Outside/Copy.app" || result.Applications[0].Name != "Saved copy" {
		t.Fatalf("legacy additions did not share one configuration read: %d, %+v", store.reads, result)
	}
	var doc struct {
		Version int
		Pending struct {
			RequestID   string
			OpaqueField bool
		}
	}
	if err := json.Unmarshal(fileBytes(t, path), &doc); err != nil || doc.Version != 1 || doc.Pending.RequestID != "original" || !doc.Pending.OpaqueField {
		t.Fatalf("saving replaced opaque pending data or changed the format: %+v, %v", doc, err)
	}
}

func TestIndividualResolutionErrorDoesNotDiscardAlreadyRestoredItemsOrApplications(t *testing.T) {
	r := types()
	store := config.NewStore(filepath.Join(t.TempDir(), "config.json"))
	choices := manualassociations.New(catalog.NewService(r), store)
	save(t, choices, manualassociations.Choice{Kind: "extension", Value: "jpg", SelectedID: "file:test.second"})
	save(t, choices, manualassociations.Choice{Kind: "scheme", Value: "fixture", SelectedID: "scheme:fixture"})
	if err := store.Update(context.Background(), func(doc *config.Document) error {
		doc.Applications = []association.AppCopy{{Path: "/Copy.app"}}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	r.onResolve = cancel
	result, err := choices.Restore(ctx)
	if err != nil || len(result.Entries) != 1 || result.Entries[0].ID != "file:test.second" || len(result.Applications) != 1 || len(result.Problems) != 1 || !errors.Is(result.Problems[0], context.Canceled) {
		t.Fatalf("individual error replaced the restored snapshot: %+v, %v", result, err)
	}
}

func TestSaveFailurePreservesThePreviouslyCommittedChoices(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	catalogService := catalog.NewService(types())
	save(t, manualassociations.New(catalogService, config.NewStore(path)), manualassociations.Choice{Kind: "scheme", Value: "original", SelectedID: "scheme:original"})
	committed := fileBytes(t, path)
	failing := config.NewStoreWithWriter(path, func(string, []byte) error { return errors.New("disk full") })
	entry, err := manualassociations.New(catalogService, failing).Save(context.Background(), manualassociations.Choice{Kind: "scheme", Value: "new", SelectedID: "scheme:new"})
	result := restore(t, manualassociations.New(catalogService, config.NewStore(path)))
	if err == nil || entry.ID != "" || len(result.Entries) != 1 || result.Entries[0].ID != "scheme:original" || !bytes.Equal(committed, fileBytes(t, path)) {
		t.Fatalf("failed save appeared committed: %+v, %+v, %v", entry, result, err)
	}
}

func TestUnreadableConfigurationIsReportedAndPreservedByBothEntrypoints(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	raw := []byte(`{broken`)
	if err := os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}
	choices := manualassociations.New(catalog.NewService(types()), config.NewStore(path))
	entry, saveErr := choices.Save(context.Background(), manualassociations.Choice{Kind: "scheme", Value: "fixture", SelectedID: "scheme:fixture"})
	result, loadErr := choices.Restore(context.Background())
	if saveErr == nil || loadErr == nil || entry.ID != "" || len(result.Entries) != 0 || len(result.Applications) != 0 || !bytes.Equal(raw, fileBytes(t, path)) {
		t.Fatalf("unreadable configuration was accepted or overwritten: %+v, %+v, %v, %v", entry, result, saveErr, loadErr)
	}
}

func TestConcurrentSavesPreserveApplicationsAndThePendingRequest(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	store := config.NewStore(path)
	choices := manualassociations.New(catalog.NewService(types()), store)
	var workers sync.WaitGroup
	for i := 0; i < 12; i++ {
		workers.Add(1)
		go func(i int) {
			defer workers.Done()
			value := fmt.Sprintf("fixture-%d", i)
			if _, err := choices.Save(context.Background(), manualassociations.Choice{Kind: "scheme", Value: value, SelectedID: "scheme:" + value}); err != nil {
				t.Errorf("association save failed: %v", err)
			}
		}(i)
	}
	workers.Add(1)
	go func() {
		defer workers.Done()
		if err := store.Update(context.Background(), func(doc *config.Document) error {
			doc.Applications = []association.AppCopy{{Path: "/Copy.app"}}
			doc.Pending = []byte(`{"requestID":"pending"}`)
			return nil
		}); err != nil {
			t.Errorf("other configuration update failed: %v", err)
		}
	}()
	workers.Wait()
	result := restore(t, manualassociations.New(catalog.NewService(types()), config.NewStore(path)))
	var doc struct{ Pending struct{ RequestID string } }
	if err := json.Unmarshal(fileBytes(t, path), &doc); err != nil || len(result.Entries) != 12 || len(result.Applications) != 1 || doc.Pending.RequestID != "pending" {
		t.Fatalf("concurrent updates lost committed data: %+v, %+v, %v", result, doc, err)
	}
}
