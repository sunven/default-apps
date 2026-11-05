//go:build darwin && cgo

package native_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/discovery"
	"github.com/sunven/default-apps/internal/native"
)

func TestNativeDiscoveryReadsRealPlistsCopiesAliasesAndLocalFailures(t *testing.T) {
	root := t.TempDir()
	plist := `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleName</key><string>Fixture Reader</string><key>CFBundleIdentifier</key><string>test.defaultapps.readonly</string><key>CFBundleShortVersionString</key><string>1.2</string><key>CFBundleDocumentTypes</key><array><dict><key>CFBundleTypeRole</key><string>Viewer</string><key>LSItemContentTypes</key><array><string>com.adobe.pdf</string><string>invalid.defaultapps.fixture</string></array><key>CFBundleTypeExtensions</key><array><string>unrelated</string></array></dict><dict><key>LSItemContentTypes</key><integer>7</integer></dict></array></dict></plist>`
	for _, name := range []string{"First/Reader.app", "Second/Reader.app", "First/Reader.app/Contents/Helper.app", "Broken.app", "Unreadable/Hidden.app"} {
		path := filepath.Join(root, name, "Contents")
		if err := os.MkdirAll(path, 0755); err != nil {
			t.Fatal(err)
		}
		contents := plist
		if name == "Second/Reader.app" {
			contents = strings.ReplaceAll(plist, "1.2", "2.4")
		}
		if name == "Broken.app" {
			contents = "not a property list"
		}
		if err := os.WriteFile(filepath.Join(path, "Info.plist"), []byte(contents), 0644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Symlink(filepath.Join(root, "First/Reader.app"), filepath.Join(root, "Alias.app")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(root, filepath.Join(root, "Second/loop")); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(filepath.Join(root, "Unreadable"), 0000); err != nil {
		t.Fatal(err)
	}
	defer os.Chmod(filepath.Join(root, "Unreadable"), 0755)
	adapter := native.Adapter{}
	service := discovery.NewService(adapter, catalog.NewService(adapter), []string{root}, nil)
	if !service.StartScan().Scanning {
		t.Fatal("native scan did not return acceptance")
	}
	deadline := time.Now().Add(10 * time.Second)
	var snapshot discovery.Snapshot
	for time.Now().Before(deadline) {
		snapshot = service.GetSnapshot()
		if !snapshot.Scanning {
			break
		}
		time.Sleep(time.Millisecond * 10)
	}
	if snapshot.Scanning {
		t.Fatal("native scan timeout")
	}
	if len(snapshot.Apps) != 3 {
		t.Fatalf("want two distinct Reader copies and broken app fallback, got %+v", snapshot.Apps)
	}
	copies := 0
	broken := false
	permission := false
	for _, app := range snapshot.Apps {
		if app.App.Name == "Fixture Reader" {
			copies++
			if (app.App.Version != "1.2" && app.App.Version != "2.4") || app.App.BundleID != "test.defaultapps.readonly" || len(app.AssociationIDs) != 3 {
				t.Fatalf("declaration or copy metadata lost: %+v", app)
			}
		}
		if app.App.Name == "Broken" {
			broken = len(app.Issues) > 0
		}
	}
	for _, issue := range snapshot.Issues {
		if issue.Path == filepath.Join(root, "Unreadable") {
			permission = true
		}
	}
	if copies != 2 || !broken || !permission {
		t.Fatalf("lost partial result or problem: copies=%d broken=%v unreadable=%v issues=%+v", copies, broken, permission, snapshot.Issues)
	}
	t.Logf("actual Foundation plist scan: apps=%d, issues=%d, duration=%dms, same-name distinct copies=%d, bundle-helper and links excluded", len(snapshot.Apps), len(snapshot.Issues), snapshot.DurationMS, copies)
}
