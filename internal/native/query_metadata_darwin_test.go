//go:build darwin && cgo

package native_test

import (
	"context"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestApplicationQueriesRefreshMetadata(t *testing.T) {
	// NSWorkspace queries need the macOS main thread. This standalone native
	// harness replaces only the four system URL lookups; all query validation,
	// metadata reads and JSON encoding use the production implementation.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	root := t.TempDir()
	binary := filepath.Join(root, "query-metadata")
	build := exec.CommandContext(ctx, "clang", "-fobjc-arc", "-mmacosx-version-min=13.0", "-framework", "AppKit", "-framework", "UniformTypeIdentifiers", "testdata/query_metadata.m", "-o", binary)
	if output, err := build.CombinedOutput(); err != nil {
		t.Fatalf("compile native query regression: %v\n%s", err, output)
	}
	if output, err := exec.CommandContext(ctx, binary, filepath.Join(root, "Reader.app")).CombinedOutput(); err != nil {
		t.Fatalf("native query metadata regression: %v\n%s", err, output)
	}
}
