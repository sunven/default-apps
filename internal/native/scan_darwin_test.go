//go:build darwin && cgo

package native_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/discovery"
	"github.com/sunven/default-apps/internal/native"
)

func TestReadApplicationIdentifiesProtectedSystemCopies(t *testing.T) {
	adapter := native.Adapter{}
	for _, path := range []string{
		"/System/Applications/Utilities/Activity Monitor.app",
		"/System/Applications/App Store.app",
		"/Applications/Safari.app",
	} {
		t.Run(filepath.Base(path), func(t *testing.T) {
			bundle, err := adapter.ReadApplication(context.Background(), path)
			if err != nil || !bundle.App.Usable() || !bundle.App.System {
				t.Fatalf("system app not identified: %v, %+v", err, bundle.App)
			}
			alias := filepath.Join(t.TempDir(), "System Alias.app")
			if err := os.Symlink(path, alias); err != nil {
				t.Fatal(err)
			}
			linked, err := adapter.ReadApplication(context.Background(), alias)
			if err != nil || !linked.App.System || linked.App.Path != bundle.App.Path {
				t.Fatalf("system alias changed classification: %v, path=%s, system=%v", err, linked.App.Path, linked.App.System)
			}
		})
	}
	// A matching Apple name/ID and a System/Applications directory are not evidence
	// that this particular copy belongs to macOS.
	path := filepath.Join(t.TempDir(), "System", "Applications", "Safari.app")
	if err := os.MkdirAll(filepath.Join(path, "Contents"), 0755); err != nil {
		t.Fatal(err)
	}
	plist := `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleName</key><string>Safari</string><key>CFBundleIdentifier</key><string>com.apple.Safari</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`
	if err := os.WriteFile(filepath.Join(path, "Contents", "Info.plist"), []byte(plist), 0644); err != nil {
		t.Fatal(err)
	}
	bundle, err := adapter.ReadApplication(context.Background(), path)
	if err != nil || !bundle.App.Usable() || bundle.App.System {
		t.Fatalf("user copy misclassified: %v, metadata=%s, system=%v", err, bundle.App.MetadataError, bundle.App.System)
	}
}

func TestReadApplicationReturnsIconForEachCopy(t *testing.T) {
	root := t.TempDir()
	for _, shade := range []color.NRGBA{{R: 255, A: 255}, {B: 255, A: 255}} {
		name := "Red.app"
		if shade.B > 0 {
			name = "Blue.app"
		}
		path := filepath.Join(root, name)
		resources := filepath.Join(path, "Contents", "Resources")
		if err := os.MkdirAll(resources, 0755); err != nil {
			t.Fatal(err)
		}
		plist := `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleName</key><string>Same Reader</string><key>CFBundleIdentifier</key><string>test.defaultapps.icon</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleExecutable</key><string>reader</string><key>CFBundleIconFile</key><string>AppIcon.icns</string></dict></plist>`
		if err := os.WriteFile(filepath.Join(path, "Contents", "Info.plist"), []byte(plist), 0644); err != nil {
			t.Fatal(err)
		}
		if err := os.MkdirAll(filepath.Join(path, "Contents", "MacOS"), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(path, "Contents", "MacOS", "reader"), []byte("#!/bin/sh\nexit 0\n"), 0755); err != nil {
			t.Fatal(err)
		}
		pixels := image.NewNRGBA(image.Rect(0, 0, 128, 128))
		for y := 0; y < 128; y++ {
			for x := 0; x < 128; x++ {
				pixels.SetNRGBA(x, y, shade)
			}
		}
		var data bytes.Buffer
		if err := png.Encode(&data, pixels); err != nil {
			t.Fatal(err)
		}
		// One 128px PNG representation in an ICNS container.
		icon := make([]byte, 16)
		copy(icon, "icns")
		binary.BigEndian.PutUint32(icon[4:], uint32(16+data.Len()))
		copy(icon[8:], "ic07")
		binary.BigEndian.PutUint32(icon[12:], uint32(8+data.Len()))
		if err := os.WriteFile(filepath.Join(resources, "AppIcon.icns"), append(icon, data.Bytes()...), 0644); err != nil {
			t.Fatal(err)
		}
		bundle, err := (native.Adapter{}).ReadApplication(context.Background(), path)
		if err != nil || !bundle.App.Usable() {
			t.Fatalf("read application: %v, metadata: %s", err, bundle.App.MetadataError)
		}
		decoded, err := base64.StdEncoding.DecodeString(bundle.App.IconData)
		if err != nil {
			t.Fatal(err)
		}
		got, err := png.Decode(bytes.NewReader(decoded))
		if err != nil {
			t.Fatal(err)
		}
		if got.Bounds().Dx() != 128 || got.Bounds().Dy() != 128 {
			t.Fatalf("unexpected icon bounds: %v", got.Bounds())
		}
		r, _, b, a := got.At(64, 64).RGBA()
		if a != 65535 || (shade.R > 0 && r <= b) || (shade.B > 0 && b <= r) {
			t.Fatalf("wrong copy's icon for %s: red=%d blue=%d alpha=%d", name, r, b, a)
		}
	}
}

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
	service := discovery.NewService(adapter, catalog.NewService(adapter), []string{root}, nil, nil)
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
