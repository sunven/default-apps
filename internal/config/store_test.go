package config_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/config"
)

func TestManualItemsSurviveReopeningAndUpdatesPreserveOtherFields(t *testing.T) {
	path := filepath.Join(t.TempDir(), "Application Support", "Default Apps", "config.json")
	store := config.NewStore(path)
	err := store.Update(context.Background(), func(doc *config.Document) error {
		doc.Associations = append(doc.Associations, config.ManualAssociation{Input: catalog.Input{Kind: "extension", Value: ".JPG", Source: "manual"}, SelectedID: "file:public.jpeg"})
		doc.Applications = append(doc.Applications, association.AppCopy{Path: "/Outside/Copy.app", DisplayPath: "/Alias.app", Name: "Copy"})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	reopened := config.NewStore(path)
	if err := reopened.Update(context.Background(), func(doc *config.Document) error { doc.Pending = []byte(`{"requestID":"one"}`); return nil }); err != nil {
		t.Fatal(err)
	}
	got, err := config.NewStore(path).Load(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	var pending struct {
		RequestID string `json:"requestID"`
	}
	if err := json.Unmarshal(got.Pending, &pending); err != nil {
		t.Fatal(err)
	}
	if got.Version != 1 || len(got.Associations) != 1 || got.Associations[0].SelectedID != "file:public.jpeg" || len(got.Applications) != 1 || got.Applications[0].Path != "/Outside/Copy.app" || pending.RequestID != "one" {
		t.Fatalf("lost persisted data: %#v", got)
	}
}

func TestUnreadableConfigurationsArePreservedAndCannotBeOverwritten(t *testing.T) {
	for _, raw := range []string{`{broken`, `{"version":2,"associations":[],"applications":[]}`, `{"version":1,"futureField":true}`, `{"version":1} {}`} {
		t.Run(raw, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "config.json")
			if err := os.WriteFile(path, []byte(raw), 0600); err != nil {
				t.Fatal(err)
			}
			store := config.NewStore(path)
			if _, err := store.Load(context.Background()); err == nil {
				t.Fatal("unreadable configuration reported as empty success")
			}
			if err := store.Update(context.Background(), func(doc *config.Document) error { doc.Applications = nil; return nil }); err == nil {
				t.Fatal("unreadable configuration overwritten")
			}
			after, err := os.ReadFile(path)
			if err != nil || string(after) != raw {
				t.Fatalf("original changed: %q %v", after, err)
			}
		})
	}
}
func TestFailedAtomicSavePreservesPreviouslyCommittedItems(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	store := config.NewStore(path)
	if err := store.Update(context.Background(), func(doc *config.Document) error {
		doc.Applications = append(doc.Applications, association.AppCopy{Path: "/Old.app"})
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(path)
	failing := config.NewStoreWithWriter(path, func(string, []byte) error { return errors.New("disk full") })
	if err := failing.Update(context.Background(), func(doc *config.Document) error {
		doc.Applications = append(doc.Applications, association.AppCopy{Path: "/New.app"})
		return nil
	}); err == nil {
		t.Fatal("save failure hidden")
	}
	after, _ := os.ReadFile(path)
	if !bytes.Equal(before, after) {
		t.Fatal("previous committed file changed")
	}
	got, err := config.NewStore(path).Load(context.Background())
	if err != nil || len(got.Applications) != 1 || got.Applications[0].Path != "/Old.app" {
		t.Fatalf("lost committed items: %#v %v", got, err)
	}
}

func TestConcurrentUpdatesKeepManualDataAndPendingRecord(t *testing.T) {
	store := config.NewStore(filepath.Join(t.TempDir(), "config.json"))
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if err := store.Update(context.Background(), func(doc *config.Document) error {
				doc.Applications = append(doc.Applications, association.AppCopy{Path: fmt.Sprintf("/Copy%d.app", i)})
				return nil
			}); err != nil {
				t.Error(err)
			}
		}(i)
	}
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := store.Update(context.Background(), func(doc *config.Document) error { doc.Pending = []byte(`{"requestID":"pending"}`); return nil }); err != nil {
			t.Error(err)
		}
	}()
	wg.Wait()
	got, err := store.Load(context.Background())
	if err != nil || len(got.Applications) != 20 || len(got.Pending) == 0 {
		t.Fatalf("lost concurrent update: %#v %v", got, err)
	}
}

func TestRenameFailureLeavesDestinationUntouchedAndRemovesTemporaryFile(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "config.json")
	if err := os.Mkdir(target, 0700); err != nil {
		t.Fatal(err)
	}
	sentinel := filepath.Join(target, "sentinel")
	if err := os.WriteFile(sentinel, []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := config.AtomicWrite(target, []byte("replacement")); err == nil {
		t.Fatal("rename over directory unexpectedly succeeded")
	}
	got, err := os.ReadFile(sentinel)
	if err != nil || string(got) != "original" {
		t.Fatalf("destination damaged: %q %v", got, err)
	}
	files, _ := os.ReadDir(dir)
	if len(files) != 1 {
		t.Fatalf("temporary files leaked: %v", files)
	}
}

func TestStructurallyInvalidConfigurationIsPreserved(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.json")
	raw := `{"version":1,"associations":[{}],"applications":[{"path":""}]}`
	if err := os.WriteFile(path, []byte(raw), 0600); err != nil {
		t.Fatal(err)
	}
	store := config.NewStore(path)
	if _, err := store.Load(context.Background()); err == nil {
		t.Fatal("malformed manual items treated as usable configuration")
	}
	if err := store.Update(context.Background(), func(doc *config.Document) error { return nil }); err == nil {
		t.Fatal("malformed configuration overwritten")
	}
	after, _ := os.ReadFile(path)
	if string(after) != raw {
		t.Fatal("malformed source not preserved")
	}
}
