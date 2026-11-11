package manual_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/config"
	"github.com/sunven/default-apps/internal/manual"
)

type dropAdapter struct {
	adapter
	calls []string
}

func (a *dropAdapter) IdentifyFile(_ context.Context, path string) (catalog.ResolvedType, error) {
	a.calls = append(a.calls, path)
	switch filepath.Base(path) {
	case "unreadable.pdf":
		return catalog.ResolvedType{}, errors.New("metadata unavailable")
	case "unknown.pdf":
		return catalog.ResolvedType{Identifier: "dyn.unknown", Dynamic: true}, nil
	case "other.pdf":
		return catalog.ResolvedType{Identifier: "public.plain-text", Declared: true}, nil
	default:
		return catalog.ResolvedType{Identifier: "com.adobe.pdf", Declared: true}, nil
	}
}
func (a *dropAdapter) ResolveIdentifier(_ context.Context, value string) ([]catalog.ResolvedType, error) {
	if value == "dyn.unknown" {
		return []catalog.ResolvedType{{Identifier: value, Dynamic: true}}, nil
	}
	return []catalog.ResolvedType{{Identifier: value, Declared: true}}, nil
}

func TestDroppedFilesKeepPartialResultsWithoutPickerOrPersistence(t *testing.T) {
	dir := t.TempDir()
	paths := []string{}
	for _, name := range []string{"first.pdf", "second.pdf", "other.pdf", "unknown.pdf", "unreadable.pdf"} {
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, nil, 0600); err != nil {
			t.Fatal(err)
		}
		paths = append(paths, path)
	}
	appPath := filepath.Join(dir, "Fixture.app")
	if err := os.Mkdir(appPath, 0700); err != nil {
		t.Fatal(err)
	}
	paths = append(paths, paths[0], dir, appPath, filepath.Join(dir, "missing.pdf"), "https://example.com/a.pdf", "relative.pdf")
	system := &dropAdapter{}
	configPath := filepath.Join(dir, "config.json")
	service := manual.NewService(catalog.NewService(system), system, config.NewStoreWithWriter(configPath, func(string, []byte) error {
		t.Fatal("identification attempted to save configuration")
		return nil
	}), picker{file: "/wrong-file"}, func() { t.Fatal("identification published a saved association") })
	got, err := service.IdentifyFiles(context.Background(), paths)
	if err != nil || len(got) != 10 || len(system.calls) != 5 {
		t.Fatalf("partial drop: %+v, %v; metadata calls %v", got, err, system.calls)
	}
	for i, key := range []string{"com.adobe.pdf", "com.adobe.pdf", "public.plain-text"} {
		if got[i].Error != "" || len(got[i].Entries) != 1 || got[i].Entries[0].Association.Key != key || got[i].Path != paths[i] {
			t.Fatalf("file identity inferred from extension or picker: %+v", got[i])
		}
	}
	for _, result := range got[3:] {
		if result.Error == "" {
			t.Fatalf("unsupported or unresolved input lost its reason: %+v", result)
		}
	}
	if _, err := os.Stat(configPath); !os.IsNotExist(err) {
		t.Fatalf("identification created configuration: %v", err)
	}
}

func TestDroppedFileIdentificationHonorsCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	system := &dropAdapter{}
	service := manual.NewService(catalog.NewService(system), system, nil, nil, nil)
	if _, err := service.IdentifyFiles(ctx, []string{"/any.pdf"}); !errors.Is(err, context.Canceled) || len(system.calls) != 0 {
		t.Fatalf("cancelled identification continued: %v, %v", err, system.calls)
	}
}
