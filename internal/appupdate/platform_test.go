package appupdate

import (
	"os"
	"path/filepath"
	"testing"
)

func TestOnlyCurrentCanonicalInstalledCopyIsEligible(t *testing.T) {
	root := t.TempDir()
	app := filepath.Join(root, "Copies", "Default Apps.app")
	binary := filepath.Join(app, "Contents", "MacOS", "default-apps")
	if err := os.MkdirAll(filepath.Dir(binary), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(binary, []byte("fixture"), 0700); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(root, "launcher")
	if err := os.Symlink(binary, link); err != nil {
		t.Fatal(err)
	}
	got, err := installLocation(link)
	if err != nil {
		t.Fatal(err)
	}
	want, err := filepath.EvalSymlinks(app)
	if err != nil || got != want {
		t.Fatal(got, want, err)
	}
	if _, err := installLocation(link + "-missing"); err == nil {
		t.Fatal("missing executable eligible")
	}
	bare := filepath.Join(root, "default-apps")
	os.WriteFile(bare, []byte("fixture"), 0700)
	if _, err := installLocation(bare); err == nil {
		t.Fatal("bare executable eligible")
	}
}
func TestStagedBundleIdentityIsCheckedBeforeReplacingApp(t *testing.T) {
	app := filepath.Join(t.TempDir(), "default-apps.app")
	os.MkdirAll(filepath.Join(app, "Contents"), 0700)
	plist := `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>wrong.app</string><key>CFBundleExecutable</key><string>default-apps</string><key>CFBundleVersion</key><string>0.2.0</string><key>CFBundleShortVersionString</key><string>0.2.0</string></dict></plist>`
	os.WriteFile(filepath.Join(app, "Contents/Info.plist"), []byte(plist), 0600)
	if err := validateBundle(app, "0.2.0"); err == nil {
		t.Fatal("wrong app identity accepted")
	}
}
