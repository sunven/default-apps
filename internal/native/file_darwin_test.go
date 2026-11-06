//go:build darwin && cgo

package native_test

import (
	"context"
	"github.com/sunven/default-apps/internal/native"
	"os"
	"path/filepath"
	"testing"
)

func TestFileIdentificationUsesNativeMetadataAndReportsMissingFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "fixture.txt")
	if err := os.WriteFile(path, []byte("fixture"), 0600); err != nil {
		t.Fatal(err)
	}
	got, err := (native.Adapter{}).IdentifyFile(context.Background(), path)
	if err != nil || got.Identifier != "public.plain-text" || got.Dynamic || !got.Declared {
		t.Fatalf("known file: %#v %v", got, err)
	}
	unknown := filepath.Join(dir, "fixture.defaultappsunknown05")
	if err := os.WriteFile(unknown, []byte(""), 0600); err != nil {
		t.Fatal(err)
	}
	got, err = (native.Adapter{}).IdentifyFile(context.Background(), unknown)
	if err != nil || !got.Dynamic || got.Declared {
		t.Fatalf("unknown file should stay dynamic: %#v %v", got, err)
	}
	if _, err = (native.Adapter{}).IdentifyFile(context.Background(), filepath.Join(dir, "missing.txt")); err == nil {
		t.Fatal("missing file error concealed")
	}
}
