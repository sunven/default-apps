// THROWAWAY Wails 3.1.0 observation harness. Real setters are off by default.
package main

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed ui/*
var assets embed.FS

type Manifest struct {
	Type    string            `json:"type"`
	Scheme  string            `json:"scheme"`
	Targets map[string]string `json:"targets"`
}
type operation struct {
	id                   uint64
	kind, key, target    string
	synthetic, cancelled bool
	done                 chan map[string]any
}
type ProbeService struct {
	mu                                sync.Mutex
	logMu                             sync.Mutex
	root                              string
	manifest                          Manifest
	allowFixtures, allowPDF, selfTest bool
	scenario                          string
	cancelAfterMs                     int
	log                               *os.File
	start                             time.Time
	seq                               uint64
	ops                               map[uint64]*operation
	events                            []map[string]any
	app                               *application.App
}

var activeProbe *ProbeService

func (p *ProbeService) record(event string, data map[string]any) {
	p.logMu.Lock()
	defer p.logMu.Unlock()
	if data == nil {
		data = map[string]any{}
	}
	data["event"], data["at"], data["elapsedMs"] = event, time.Now().Format(time.RFC3339Nano), time.Since(p.start).Milliseconds()
	p.events = append(p.events, data)
	if err := json.NewEncoder(p.log).Encode(data); err != nil {
		panic(err)
	}
	if err := p.log.Sync(); err != nil {
		panic(err)
	}
}

func (p *ProbeService) Config() map[string]any {
	return map[string]any{"manifest": p.manifest, "allowFixtures": p.allowFixtures,
		"allowPDF": p.allowPDF, "selfTest": p.selfTest, "logPath": p.log.Name(),
		"scenario": p.scenario, "cancelAfterMs": p.cancelAfterMs}
}
func (p *ProbeService) Snapshot() []map[string]any {
	items := application.InvokeSyncWithResult(func() []map[string]any {
		return []map[string]any{query("type", "com.adobe.pdf"), query("scheme", "mailto"),
			query("scheme", "http"), query("scheme", "https"),
			query("type", p.manifest.Type), query("scheme", p.manifest.Scheme)}
	})
	p.record("snapshot", map[string]any{"items": items})
	return items
}
func (p *ProbeService) Ping() map[string]any {
	isMain := application.InvokeSyncWithResult(mainThread)
	p.mu.Lock()
	realPending := false
	for _, op := range p.ops {
		if !op.synthetic {
			realPending = true
		}
	}
	p.mu.Unlock()
	if realPending {
		p.record("main-thread-ping-during-native-request", map[string]any{"responsive": isMain})
	}
	return map[string]any{"mainThreadResponsive": isMain, "elapsedMs": time.Since(p.start).Milliseconds()}
}
func (p *ProbeService) Events() []map[string]any {
	p.logMu.Lock()
	defer p.logMu.Unlock()
	return append([]map[string]any{}, p.events...)
}
func (p *ProbeService) Note(message string) {
	p.record("human-observation", map[string]any{"message": message})
}
func (p *ProbeService) FrontendReport(report map[string]any) {
	p.record("frontend-report", report)
}
func (p *ProbeService) SetFixture(ctx context.Context, kind, target string) (map[string]any, error) {
	if !p.allowFixtures {
		p.record("write-denied", map[string]any{"scope": "fixtures"})
		return nil, errors.New("未启用专用关联写入")
	}
	key := p.manifest.Scheme
	if kind == "type" {
		key = p.manifest.Type
	} else if kind != "scheme" {
		return nil, errors.New("仅支持 type / scheme")
	}
	path, ok := p.manifest.Targets[target]
	if !ok {
		return nil, errors.New("未知测试应用")
	}
	real, err := filepath.EvalSymlinks(path)
	if err != nil || real != path {
		return nil, errors.New("测试应用不存在或路径已变化")
	}
	return p.run(ctx, kind, key, path, false, 0)
}
func (p *ProbeService) SetPDF(ctx context.Context, target string) (map[string]any, error) {
	if !p.allowPDF {
		p.record("write-denied", map[string]any{"scope": "pdf"})
		return nil, errors.New("未启用 PDF 写入")
	}
	path := "/System/Applications/Preview.app"
	if target == "restore" {
		var baseline map[string]any
		data, err := os.ReadFile(filepath.Join(p.root, "pdf-experiment-baseline.json"))
		if err != nil {
			return nil, err
		}
		if err = json.Unmarshal(data, &baseline); err != nil {
			return nil, err
		}
		path, _ = baseline["pdf"].(string)
		if path == "" {
			return nil, errors.New("基线没有可恢复的 PDF 应用")
		}
	} else if target != "preview" {
		return nil, errors.New("PDF 仅可测试预览或恢复基线")
	}
	if _, err := os.Stat(path); err != nil {
		return nil, err
	}
	return p.run(ctx, "type", "com.adobe.pdf", path, false, 0)
}
func (p *ProbeService) Synthetic(ctx context.Context, milliseconds int) (map[string]any, error) {
	if milliseconds < 100 || milliseconds > 30000 {
		return nil, errors.New("延迟必须在 100–30000 ms 之间")
	}
	return p.run(ctx, "synthetic", "delayed-callback", "", true, milliseconds)
}
func (p *ProbeService) run(ctx context.Context, kind, key, target string, synthetic bool, milliseconds int) (map[string]any, error) {
	p.mu.Lock()
	for _, op := range p.ops {
		if op.kind == kind && op.key == key {
			p.mu.Unlock()
			return nil, errors.New("同一关联仍有未完成原生请求")
		}
	}
	p.seq++
	op := &operation{id: p.seq, kind: kind, key: key, target: target, synthetic: synthetic, done: make(chan map[string]any, 1)}
	p.ops[op.id] = op
	p.mu.Unlock()
	p.record("operation-created", map[string]any{"id": op.id, "kind": kind, "key": key, "target": target, "synthetic": synthetic})
	application.InvokeSync(func() {
		p.record("native-submitted", map[string]any{"id": op.id, "mainThread": mainThread(), "synthetic": synthetic})
		if synthetic {
			delayed(op.id, milliseconds)
		} else {
			submit(op.id, kind, key, target)
		}
	})
	select {
	case result := <-op.done:
		return result, nil
	case <-ctx.Done():
		p.mu.Lock()
		op.cancelled = true
		p.mu.Unlock()
		p.record("go-wait-cancelled", map[string]any{"id": op.id, "nativeRequestStillAlive": true})
		return nil, ctx.Err()
	}
}
func (p *ProbeService) complete(id uint64, result map[string]any) {
	p.mu.Lock()
	op := p.ops[id]
	if op == nil {
		p.mu.Unlock()
		p.record("unknown-callback", map[string]any{"id": id})
		return
	}
	if op.synthetic {
		delete(p.ops, id)
	}
	result["id"], result["lateAfterCancellation"] = id, op.cancelled
	p.mu.Unlock()
	p.record("native-completion", result)
	op.done <- result
	if !op.synthetic {
		go func() {
			started := time.Now()
			for _, offset := range []time.Duration{0, 100 * time.Millisecond, 500 * time.Millisecond, 2 * time.Second} {
				if wait := offset - time.Since(started); wait > 0 {
					time.Sleep(wait)
				}
				value := application.InvokeSyncWithResult(func() map[string]any { return query(op.kind, op.key) })
				p.record("readback", map[string]any{"id": id, "afterCompletionMs": time.Since(started).Milliseconds(), "observed": value, "requestedPath": op.target})
			}
			p.mu.Lock()
			delete(p.ops, id)
			p.mu.Unlock()
			p.record("observation-window-ended", map[string]any{"id": id})
		}()
	}
}
func (p *ProbeService) Quit() {
	p.mu.Lock()
	pending := len(p.ops)
	p.mu.Unlock()
	p.record("quit-requested", map[string]any{"pendingNativeRequests": pending})
	p.app.Quit()
}

func main() {
	root := flag.String("workspace", "", "absolute path of this disposable probe")
	inspect := flag.Bool("inspect", false, "read-only JSON snapshot, no window")
	selfTest := flag.Bool("self-test", false, "read-only Wails/WebKit cancellation checks")
	allowFixtures := flag.Bool("allow-fixtures", false, "explicitly enable only dedicated test associations")
	allowPDF := flag.Bool("allow-pdf", false, "explicitly enable PDF → Preview and restore baseline")
	scenario := flag.String("scenario", "", "optional fixture:type:a, fixture:scheme:b, pdf:preview, pdf:restore or synthetic:6000")
	cancelAfterMs := flag.Int("cancel-after-ms", -1, "cancel scenario's Go wait after this delay; does not revoke a native request")
	quitAfterMs := flag.Int("quit-after-ms", -1, "quit with a possibly pending request; for explicit lifecycle tests")
	flag.Parse()
	if *root == "" {
		panic("--workspace is required")
	}
	absRoot, err := filepath.Abs(*root)
	if err != nil {
		panic(err)
	}
	var manifest Manifest
	data, err := os.ReadFile(filepath.Join(absRoot, "manifest.json"))
	if err != nil {
		panic(err)
	}
	if err = json.Unmarshal(data, &manifest); err != nil {
		panic(err)
	}
	if *inspect {
		items := []map[string]any{query("type", "com.adobe.pdf"), query("scheme", "mailto"), query("scheme", "http"), query("scheme", "https"), query("type", manifest.Type), query("scheme", manifest.Scheme)}
		json.NewEncoder(os.Stdout).Encode(items)
		return
	}
	if *selfTest && (*allowFixtures || *allowPDF) {
		panic("self-test must remain read-only")
	}
	if err = os.MkdirAll(filepath.Join(absRoot, "runs"), 0755); err != nil {
		panic(err)
	}
	logPath := filepath.Join(absRoot, "runs", time.Now().Format("20060102-150405.000")+".jsonl")
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		panic(err)
	}
	p := &ProbeService{root: absRoot, manifest: manifest, allowFixtures: *allowFixtures, allowPDF: *allowPDF,
		selfTest: *selfTest, log: logFile, start: time.Now(), ops: map[uint64]*operation{}}
	p.scenario, p.cancelAfterMs = *scenario, *cancelAfterMs
	activeProbe = p
	p.record("startup", map[string]any{"allowFixtures": *allowFixtures, "allowPDF": *allowPDF, "selfTest": *selfTest})
	fmt.Println("Probe log:", logPath)
	app := application.New(application.Options{Name: "Default Apps · 原生探针", Services: []application.Service{application.NewService(p)},
		Assets: application.AssetOptions{Handler: application.BundledAssetFileServer(assets)},
		Mac:    application.MacOptions{ApplicationShouldTerminateAfterLastWindowClosed: true}})
	p.app = app
	app.Window.NewWithOptions(application.WebviewWindowOptions{Name: "native-probe", Title: "Default Apps · 原生行为探针", Width: 1080, Height: 780, MinWidth: 980, MinHeight: 640, URL: "/"})
	if *quitAfterMs >= 0 {
		go func() { time.Sleep(time.Duration(*quitAfterMs) * time.Millisecond); p.Quit() }()
	}
	if err = app.Run(); err != nil {
		panic(err)
	}
	p.mu.Lock()
	pending := len(p.ops)
	p.mu.Unlock()
	p.record("process-exit", map[string]any{"pendingNativeRequests": pending})
	logFile.Close()
}
