package appupdate

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/sunven/default-apps/internal/change"
	"github.com/sunven/default-apps/internal/config"
	"github.com/wailsapp/wails/v3/pkg/updater"
)

type fakeEngine struct {
	mu                          sync.Mutex
	rel                         *updater.Release
	checks, downloads, restarts int
	checkWait                   chan struct{}
	restartErr                  error
	path                        string
}

func (f *fakeEngine) Check(context.Context) (*updater.Release, error) {
	f.mu.Lock()
	f.checks++
	f.mu.Unlock()
	if f.checkWait != nil {
		<-f.checkWait
	}
	return f.rel, nil
}
func (f *fakeEngine) DownloadAndInstall(context.Context) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.downloads++
	return nil
}
func (f *fakeEngine) DownloadedPath() string { return f.path }
func (f *fakeEngine) Restart(context.Context) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.restarts++
	return f.restartErr
}
func (f *fakeEngine) counts() (int, int, int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.checks, f.downloads, f.restarts
}
func changeGate(t *testing.T) *change.Service {
	t.Helper()
	return change.NewService(nil, nil, nil, config.NewStore(filepath.Join(t.TempDir(), "config.json")), nil, change.Options{})
}
func testService(t *testing.T, f *fakeEngine) *Service {
	t.Helper()
	s := NewService(Options{CurrentVersion: "0.1.0", DisabledReason: "test"}, changeGate(t))
	s.state.DisabledReason = ""
	s.state.Phase = "idle"
	s.engine = f
	app := filepath.Join(t.TempDir(), "default-apps.app", "Contents", "MacOS", "default-apps")
	if err := os.MkdirAll(filepath.Dir(app), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(app, []byte("fixture"), 0700); err != nil {
		t.Fatal(err)
	}
	s.executable = func() (string, error) { return app, nil }
	s.validate = func(string, string) error { return nil }
	t.Cleanup(func() { Close(s) })
	return s
}
func waitPhase(t *testing.T, s *Service, phase string) Snapshot {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		v := s.GetSnapshot()
		if v.Phase == phase {
			return v
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("wanted %s; got %+v", phase, s.GetSnapshot())
	return Snapshot{}
}
func TestCheckIsSingleFlightAndNeverDownloads(t *testing.T) {
	f := &fakeEngine{rel: &updater.Release{Version: "0.2.0"}, checkWait: make(chan struct{})}
	s := testService(t, f)
	s.Check()
	s.Check()
	Start(s)
	close(f.checkWait)
	waitPhase(t, s, "available")
	checks, downloads, _ := f.counts()
	if checks != 1 || downloads != 0 {
		t.Fatal(checks, downloads)
	}
}
func TestDownloadWaitsForExplicitRestartAndFailedHelperCanRetry(t *testing.T) {
	f := &fakeEngine{rel: &updater.Release{Version: "0.2.0"}, restartErr: errors.New("helper unavailable")}
	s := testService(t, f)
	s.Check()
	waitPhase(t, s, "available")
	if _, err := s.Download(); err != nil {
		t.Fatal(err)
	}
	waitPhase(t, s, "ready")
	_, downloads, restarts := f.counts()
	if downloads != 1 || restarts != 0 {
		t.Fatal(downloads, restarts)
	}
	if _, err := s.Restart(); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if v := s.GetSnapshot(); v.Phase == "ready" && v.Error != "" {
			break
		}
		time.Sleep(time.Millisecond)
	}
	v := s.GetSnapshot()
	if v.Phase != "ready" || v.Error == "" || s.changes.GetSnapshot().Quit.Restarting {
		t.Fatal(v)
	}
	if _, err := s.Restart(); err != nil {
		t.Fatal(err)
	}
}
func TestInvalidStagingNeverBecomesReady(t *testing.T) {
	f := &fakeEngine{rel: &updater.Release{Version: "0.2.0"}}
	s := testService(t, f)
	s.validate = func(string, string) error { return errors.New("wrong bundle") }
	s.Check()
	waitPhase(t, s, "available")
	s.Download()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if s.GetSnapshot().Error != "" {
			break
		}
		time.Sleep(time.Millisecond)
	}
	if v := s.GetSnapshot(); v.Phase != "available" || v.Error == "" {
		t.Fatal(v)
	}
	if _, err := s.Restart(); err == nil {
		t.Fatal("invalid bundle allowed restart")
	}
}
func TestDevelopmentServiceDoesNotTouchNetwork(t *testing.T) {
	s := NewService(Options{CurrentVersion: "0.1.0", DisabledReason: "development"}, changeGate(t))
	defer Close(s)
	Start(s)
	s.Check()
	if _, err := s.Download(); err == nil {
		t.Fatal("development download allowed")
	}
	if s.GetSnapshot().Phase != "disabled" {
		t.Fatal(s.GetSnapshot())
	}
}

type archiveProvider struct {
	body   []byte
	digest []byte
}

func (p archiveProvider) Name() string { return "fixture" }
func (p archiveProvider) Check(context.Context, updater.CheckRequest) (*updater.Release, error) {
	return &updater.Release{Version: "0.2.0", Artifact: updater.Artifact{Filename: artifactName}, Verification: &updater.Verification{DigestAlgo: "sha256", Digest: p.digest}}, nil
}
func (p archiveProvider) Download(_ context.Context, _ *updater.Release, w io.Writer, progress func(int64, int64)) error {
	n, err := w.Write(p.body)
	progress(int64(n), 0)
	return err
}
func TestRealEngineRejectsChangedBytesBeforeExtraction(t *testing.T) {
	var body bytes.Buffer
	z := zip.NewWriter(&body)
	w, _ := z.Create("default-apps.app/Contents/MacOS/default-apps")
	w.Write([]byte("fixture"))
	z.Close()
	sum := sha256.Sum256(body.Bytes())
	for _, corrupt := range []bool{false, true} {
		t.Run(map[bool]string{false: "valid", true: "corrupt"}[corrupt], func(t *testing.T) {
			digest := append([]byte(nil), sum[:]...)
			if corrupt {
				digest[0] ^= 0xff
			}
			s := NewService(Options{CurrentVersion: "0.1.0", DisabledReason: "test"}, changeGate(t))
			s.state.DisabledReason = ""
			s.state.Phase = "idle"
			u := updater.New(&host{service: s})
			if err := u.Init(updater.Config{CurrentVersion: "0.1.0", Providers: []updater.Provider{archiveProvider{body.Bytes(), digest}}, Window: updater.WindowNone}); err != nil {
				t.Fatal(err)
			}
			s.engine = u
			t.Cleanup(func() { Close(s) })
			if _, err := u.Check(context.Background()); err != nil {
				t.Fatal(err)
			}
			err := u.DownloadAndInstall(context.Background())
			if corrupt {
				if err == nil || u.DownloadedPath() != "" {
					t.Fatal("corrupt archive staged", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			data, err := os.ReadFile(filepath.Join(u.DownloadedPath(), "Contents/MacOS/default-apps"))
			if err != nil || string(data) != "fixture" {
				t.Fatal(string(data), err)
			}
		})
	}
}
