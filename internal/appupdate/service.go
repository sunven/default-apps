// Package appupdate owns this tool's update lifecycle; association changes stay
// in change. Only an approved, ready helper may commit application shutdown.
package appupdate

import (
	"context"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/sunven/default-apps/internal/change"
	"github.com/wailsapp/wails/v3/pkg/updater"
)

type ReleaseInfo struct {
	Version string `json:"version"`
	Notes   string `json:"notes"`
	Date    string `json:"date"`
}
type Snapshot struct {
	Version        uint64       `json:"version"`
	CurrentVersion string       `json:"currentVersion"`
	Phase          string       `json:"phase"`
	DisabledReason string       `json:"disabledReason"`
	Release        *ReleaseInfo `json:"release"`
	Written        int64        `json:"written"`
	Total          int64        `json:"total"`
	Error          string       `json:"error"`
	InstallPath    string       `json:"installPath"`
	ReleaseURL     string       `json:"releaseURL"`
}
type Options struct {
	CurrentVersion string
	DisabledReason string
	Provider       updater.Provider
	Publish        func(Snapshot)
	Quit           func()
}
type engine interface {
	Check(context.Context) (*updater.Release, error)
	DownloadAndInstall(context.Context) error
	DownloadedPath() string
	Restart(context.Context) error
}
type Service struct {
	mu          sync.Mutex
	state       Snapshot
	engine      engine
	changes     *change.Service
	options     Options
	executable  func() (string, error)
	validate    func(string, string) error
	ctx         context.Context
	cancel      context.CancelFunc
	wg          sync.WaitGroup
	startup     sync.Once
	transferred bool
	closed      bool
}

func NewService(options Options, changes *change.Service) *Service {
	ctx, cancel := context.WithCancel(context.Background())
	s := &Service{options: options, changes: changes, ctx: ctx, cancel: cancel, executable: os.Executable, validate: validateBundle,
		state: Snapshot{CurrentVersion: options.CurrentVersion, Phase: "idle", DisabledReason: options.DisabledReason, ReleaseURL: ReleaseURL}}
	if runtime.GOOS != "darwin" || runtime.GOARCH != "arm64" {
		s.state.DisabledReason = "本轮更新仅支持 macOS Apple Silicon。"
	}
	if s.state.DisabledReason != "" {
		s.state.Phase = "disabled"
		return s
	}
	provider := options.Provider
	if provider == nil {
		var err error
		provider, err = NewProvider(&http.Client{}, "")
		if err != nil {
			s.state.Error = err.Error()
			s.state.Phase = "error"
			s.state.DisabledReason = "更新服务初始化失败。"
			return s
		}
	}
	u := updater.New(&host{service: s})
	if err := u.Init(updater.Config{CurrentVersion: options.CurrentVersion, Providers: []updater.Provider{provider}, Window: updater.WindowNone}); err != nil {
		s.state.Error = err.Error()
		s.state.Phase = "error"
		s.state.DisabledReason = "更新服务初始化失败。"
	}
	s.engine = u
	return s
}
func (s *Service) snapshotLocked() Snapshot {
	v := s.state
	if v.Release != nil {
		r := *v.Release
		v.Release = &r
	}
	return v
}
func (s *Service) changedLocked() Snapshot { s.state.Version++; return s.snapshotLocked() }
func (s *Service) publish(v Snapshot) {
	if s.options.Publish != nil {
		s.options.Publish(v)
	}
}
func (s *Service) GetSnapshot() Snapshot { s.mu.Lock(); defer s.mu.Unlock(); return s.snapshotLocked() }

// Start checks once per process, even if the frontend reloads or remounts.
func Start(s *Service) {
	s.startup.Do(func() {
		s.mu.Lock()
		if s.closed || s.state.DisabledReason != "" {
			s.mu.Unlock()
			return
		}
		s.wg.Add(1)
		s.mu.Unlock()
		go func() {
			defer s.wg.Done()
			timer := time.NewTimer(time.Second)
			defer timer.Stop()
			select {
			case <-s.ctx.Done():
				return
			case <-timer.C:
			}
			s.mu.Lock()
			untouched := s.state.Phase == "idle"
			s.mu.Unlock()
			if untouched {
				s.Check()
			}
		}()
	})
}
func busy(phase string) bool {
	return phase == "checking" || phase == "downloading" || phase == "verifying" || phase == "staging" || phase == "restarting"
}
func (s *Service) Check() Snapshot {
	s.mu.Lock()
	if s.closed || s.state.DisabledReason != "" || busy(s.state.Phase) || s.state.Phase == "ready" {
		v := s.snapshotLocked()
		s.mu.Unlock()
		return v
	}
	s.state.Phase, s.state.Error, s.state.Release = "checking", "", nil
	s.state.Written, s.state.Total = 0, 0
	v := s.changedLocked()
	s.wg.Add(1)
	s.mu.Unlock()
	s.publish(v)
	go func() {
		defer s.wg.Done()
		ctx, cancel := context.WithTimeout(s.ctx, 30*time.Second)
		defer cancel()
		rel, err := s.engine.Check(ctx)
		s.mu.Lock()
		if s.closed {
			s.mu.Unlock()
			return
		}
		if err != nil {
			s.state.Phase = "error"
			s.state.Error = "检查更新失败：" + err.Error()
		} else if rel == nil {
			s.state.Phase = "current"
		} else {
			s.state.Phase = "available"
			s.state.Release = &ReleaseInfo{Version: rel.Version, Notes: rel.Notes, Date: rel.PublishedAt.UTC().Format(time.RFC3339)}
		}
		next := s.changedLocked()
		s.mu.Unlock()
		s.publish(next)
	}()
	return v
}
func (s *Service) Download() (Snapshot, error) {
	s.mu.Lock()
	if s.closed || s.state.DisabledReason != "" || busy(s.state.Phase) || s.state.Release == nil || s.state.Phase == "ready" {
		v := s.snapshotLocked()
		s.mu.Unlock()
		return v, errors.New("当前没有可下载的更新。")
	}
	location, err := s.location()
	if err != nil {
		s.state.Error = err.Error()
		v := s.changedLocked()
		s.mu.Unlock()
		s.publish(v)
		return v, err
	}
	s.state.InstallPath = location
	s.state.Phase, s.state.Error = "downloading", ""
	s.state.Written, s.state.Total = 0, 0
	version := s.state.Release.Version
	v := s.changedLocked()
	s.wg.Add(1)
	s.mu.Unlock()
	s.publish(v)
	go func() {
		defer s.wg.Done()
		ctx, cancel := context.WithTimeout(s.ctx, 15*time.Minute)
		defer cancel()
		err := s.engine.DownloadAndInstall(ctx)
		if err == nil {
			err = s.validate(s.engine.DownloadedPath(), version)
		}
		s.mu.Lock()
		if s.closed {
			s.mu.Unlock()
			return
		}
		if err != nil {
			s.state.Phase = "available"
			s.state.Error = "下载或校验失败：" + err.Error()
		} else {
			s.state.Phase = "ready"
		}
		next := s.changedLocked()
		s.mu.Unlock()
		s.publish(next)
	}()
	return v, nil
}
func (s *Service) location() (string, error) {
	executable, err := s.executable()
	if err != nil {
		return "", err
	}
	return installLocation(executable)
}
func (s *Service) Restart() (Snapshot, error) {
	s.mu.Lock()
	if s.closed || s.state.Phase != "ready" || s.state.Release == nil {
		v := s.snapshotLocked()
		s.mu.Unlock()
		return v, errors.New("更新尚未准备好。")
	}
	version := s.state.Release.Version
	s.mu.Unlock()
	if _, err := s.location(); err != nil {
		return s.GetSnapshot(), err
	}
	if err := s.validate(s.engine.DownloadedPath(), version); err != nil {
		return s.GetSnapshot(), err
	}
	if err := change.PrepareRestart(s.changes, s.apply); err != nil {
		return s.GetSnapshot(), err
	}
	return s.GetSnapshot(), nil
}
func (s *Service) apply() {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		change.CancelRestart(s.changes)
		return
	}
	s.state.Phase, s.state.Error = "restarting", ""
	v := s.changedLocked()
	s.wg.Add(1)
	s.mu.Unlock()
	s.publish(v)
	defer s.wg.Done()
	// The user may leave the uncertainty prompt open for a while. Revalidate the
	// exact current location and staged bundle at the moment they actually agree.
	_, err := s.location()
	if err == nil {
		err = s.validate(s.engine.DownloadedPath(), v.Release.Version)
	}
	if err == nil {
		err = s.engine.Restart(s.ctx)
	}
	if err != nil {
		change.CancelRestart(s.changes)
		s.mu.Lock()
		s.state.Phase = "ready"
		s.state.Error = "重启安装未开始：" + err.Error()
		next := s.changedLocked()
		s.mu.Unlock()
		s.publish(next)
	}
}

// Close cancels network work and discards this process's staging on ordinary
// shutdown. Staging handed to an acknowledged helper belongs to the helper.
func Close(s *Service) {
	s.mu.Lock()
	s.closed = true
	s.cancel()
	s.mu.Unlock()
	done := make(chan struct{})
	go func() { s.wg.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		return
	}
	s.mu.Lock()
	transferred := s.transferred
	s.mu.Unlock()
	if transferred || s.engine == nil {
		return
	}
	path := s.engine.DownloadedPath()
	if path == "" {
		return
	}
	parent := filepath.Dir(path)
	if strings.HasPrefix(filepath.Base(parent), "wails-update-") {
		_ = os.RemoveAll(parent)
	}
}

type host struct{ service *Service }

func (h *host) Emit(name string, data ...any) bool {
	s := h.service
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return false
	}
	switch name {
	case updater.EventDownloadProgress:
		if len(data) > 0 {
			if p, ok := data[0].(updater.Progress); ok {
				s.state.Written, s.state.Total = p.Written, p.Total
			}
		}
	case updater.EventVerifying:
		s.state.Phase = "verifying"
	case updater.EventInstalling:
		s.state.Phase = "staging"
	default:
		s.mu.Unlock()
		return true
	}
	v := s.changedLocked()
	s.mu.Unlock()
	s.publish(v)
	return true
}
func (*host) OnEvent(string, func(any)) func()                      { return func() {} }
func (*host) OpenWindow(updater.WindowOptions) updater.WindowHandle { return nil } // WindowNone; product owns UI.
func (h *host) Quit() {
	s := h.service
	if !change.CommitRestart(s.changes) {
		panic("update helper reached shutdown without restart approval")
	}
	s.mu.Lock()
	s.transferred = true
	s.mu.Unlock()
	if s.options.Quit != nil {
		go s.options.Quit()
	}
}
