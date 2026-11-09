//go:build darwin && cgo

package native_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/native"
)

type applicationCopyReader struct {
	name string
	read func(context.Context, string) (association.AppCopy, error)
}

func applicationCopyReaders() []applicationCopyReader {
	adapter := native.Adapter{}
	return []applicationCopyReader{
		{name: "copy", read: adapter.ReadApplicationCopy},
		{name: "declarations", read: func(ctx context.Context, path string) (association.AppCopy, error) {
			bundle, err := adapter.ReadApplication(ctx, path)
			return bundle.App, err
		}},
	}
}

func writeApplicationPlist(t *testing.T, path, plist string) {
	t.Helper()
	contents := filepath.Join(path, "Contents")
	if err := os.MkdirAll(contents, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(contents, "Info.plist"), []byte(plist), 0644); err != nil {
		t.Fatal(err)
	}
}

func TestApplicationReadersPreservePathsAndRefreshCopyMetadata(t *testing.T) {
	for _, reader := range applicationCopyReaders() {
		t.Run(reader.name, func(t *testing.T) {
			root := t.TempDir()
			path := filepath.Join(root, "Reader.app")
			writeApplicationPlist(t, path, `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleName</key><string>Before</string><key>CFBundleIdentifier</key><string>test.before</string><key>CFBundleShortVersionString</key><string>1</string></dict></plist>`)
			canonical, err := filepath.EvalSymlinks(path)
			if err != nil {
				t.Fatal(err)
			}
			alias := filepath.Join(root, "Alias.app")
			if err := os.Symlink(path, alias); err != nil {
				t.Fatal(err)
			}
			app, err := reader.read(context.Background(), alias)
			if err != nil || !app.Usable() || app.Path != canonical || app.DisplayPath != alias || app.Name != "Before" || app.Version != "1" || app.BundleID != "test.before" {
				t.Fatalf("copy identity or initial metadata lost: %+v, %v", app, err)
			}
			writeApplicationPlist(t, path, `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleDisplayName</key><string>After</string><key>CFBundleIdentifier</key><string>test.after</string><key>CFBundleVersion</key><string>2</string></dict></plist>`)
			app, err = reader.read(context.Background(), alias)
			if err != nil || !app.Usable() || app.Path != canonical || app.DisplayPath != alias || app.Name != "After" || app.Version != "2" || app.BundleID != "test.after" {
				t.Fatalf("refresh reused cached metadata: %+v, %v", app, err)
			}
			writeApplicationPlist(t, path, `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleName</key><string>Without version or ID</string></dict></plist>`)
			app, err = reader.read(context.Background(), path)
			if err != nil || !app.Usable() || app.Name != "Without version or ID" || app.Version != "" || app.BundleID != "" {
				t.Fatalf("removed metadata retained cached values: %+v, %v", app, err)
			}
		})
	}
}

func TestApplicationReadersReturnDamagedMetadataWithoutTopLevelError(t *testing.T) {
	for _, scenario := range []struct {
		name, plist string
	}{
		{name: "missing"},
		{name: "malformed", plist: "not a property list"},
		{name: "non-dictionary", plist: `<?xml version="1.0"?><plist version="1.0"><array><string>not a dictionary</string></array></plist>`},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "Broken.app")
			if err := os.MkdirAll(filepath.Join(path, "Contents"), 0755); err != nil {
				t.Fatal(err)
			}
			if scenario.plist != "" {
				writeApplicationPlist(t, path, scenario.plist)
			}
			canonical, err := filepath.EvalSymlinks(path)
			if err != nil {
				t.Fatal(err)
			}
			for _, reader := range applicationCopyReaders() {
				t.Run(reader.name, func(t *testing.T) {
					app, err := reader.read(context.Background(), path)
					if err != nil || app.Usable() || app.Path != canonical || app.DisplayPath != path || app.MetadataError == "" || app.Version != "" || app.BundleID != "" {
						t.Fatalf("damaged metadata must retain an unavailable copy: %+v, %v", app, err)
					}
				})
			}
			bundle, err := (native.Adapter{}).ReadApplication(context.Background(), path)
			if err != nil || len(bundle.Info) != 0 || len(bundle.Issues) != 1 {
				t.Fatalf("damaged declaration result changed: %+v, %v", bundle, err)
			}
			issue := bundle.Issues[0]
			if issue.Path != canonical || issue.Origin != "Info.plist" || issue.Message != bundle.App.MetadataError {
				t.Fatalf("declaration issue lost copy context: %+v", issue)
			}
		})
	}
}

func TestApplicationReadersRejectUnavailableLocations(t *testing.T) {
	root := t.TempDir()
	file := filepath.Join(root, "File.app")
	if err := os.WriteFile(file, []byte("not a directory"), 0644); err != nil {
		t.Fatal(err)
	}
	missing := filepath.Join(root, "Missing.app")
	alias := filepath.Join(root, "Dangling.app")
	if err := os.Symlink(missing, alias); err != nil {
		t.Fatal(err)
	}
	for _, reader := range applicationCopyReaders() {
		t.Run(reader.name, func(t *testing.T) {
			for _, path := range []string{missing, file, alias} {
				t.Run(filepath.Base(path), func(t *testing.T) {
					app, err := reader.read(context.Background(), path)
					if err == nil || app != (association.AppCopy{}) {
						t.Fatalf("unavailable location must fail without a copy: %+v, %v", app, err)
					}
				})
			}
		})
	}
}

func TestApplicationReadersRespectCanceledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	for _, reader := range applicationCopyReaders() {
		t.Run(reader.name, func(t *testing.T) {
			app, err := reader.read(ctx, "/Missing.app")
			if !errors.Is(err, context.Canceled) || app != (association.AppCopy{}) {
				t.Fatalf("canceled read changed: %+v, %v", app, err)
			}
		})
	}
}
