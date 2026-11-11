package main

import (
	"embed"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/sunven/default-apps/internal/appupdate"
	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/buildinfo"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/change"
	"github.com/sunven/default-apps/internal/discovery"
	"github.com/sunven/default-apps/internal/manual"
	"github.com/sunven/default-apps/internal/native"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

func init() {
	application.RegisterEvent[discovery.Snapshot]("defaultapps:catalog")
	application.RegisterEvent[change.Snapshot]("defaultapps:change")
	application.RegisterEvent[association.QueryResult]("defaultapps:observation")
	application.RegisterEvent[appupdate.Snapshot]("defaultapps:update")
	application.RegisterEvent[[]string]("defaultapps:files-dropped")
}

func main() {
	if len(os.Args) == 2 && os.Args[1] == "--version" {
		fmt.Println(buildinfo.Version())
		return
	}
	home, err := os.UserHomeDir()
	if err != nil {
		log.Fatal(err)
	}
	catalogService := catalog.NewService(native.Adapter{})
	store, querySystem, appReader, dispatcher, writableKinds := changeEnvironment(home)
	associationService := association.NewService(querySystem)
	picker := &NativePicker{}
	var app *application.App
	changeService := change.NewService(catalogService, associationService, appReader, store, dispatcher, change.Options{WritableKinds: writableKinds, Publish: func(snapshot change.Snapshot) {
		if app != nil {
			app.Event.Emit("defaultapps:change", snapshot)
		}
	}, PublishObservation: func(result association.QueryResult) {
		if app != nil {
			app.Event.Emit("defaultapps:observation", result)
		}
	}, Quit: func() {
		if app != nil {
			app.Quit()
		}
	}})
	discoveryService := discovery.NewService(native.Adapter{}, catalogService, []string{"/Applications", filepath.Join(home, "Applications"), "/System/Applications"}, func(snapshot discovery.Snapshot) { app.Event.Emit("defaultapps:catalog", snapshot) }, store)
	manualService := manual.NewService(catalogService, native.Adapter{}, store, picker, func() { discoveryService.StartScan() })
	updateService := appupdate.NewService(configureUpdateSource(appupdate.Options{CurrentVersion: buildinfo.Version(), DisabledReason: updateDisabledReason(), Publish: func(snapshot appupdate.Snapshot) {
		if app != nil {
			app.Event.Emit("defaultapps:update", snapshot)
		}
	}, Quit: func() {
		if app != nil {
			app.Quit()
		}
	}}), changeService)
	app = newApplication(home, application.Options{
		Name:        "Default Apps",
		Description: "查看与管理 macOS 文件类型和 URL 协议的默认应用",
		Services:    []application.Service{application.NewService(changeService), application.NewService(catalogService), application.NewService(discoveryService), application.NewService(manualService), application.NewService(updateService)},
		OnShutdown:  func() { appupdate.Close(updateService) },
		Assets:      application.AssetOptions{Handler: application.AssetFileServerFS(assets)},
		Mac:         application.MacOptions{ApplicationShouldTerminateAfterLastWindowClosed: true},
		ShouldQuit: func() bool {
			allowed := changeService.RequestQuit()
			traceQuitHook("ShouldQuit", allowed)
			return allowed
		},
	})
	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name: "main", Title: "Default Apps", Width: 1180, Height: 800,
		BackgroundColour: application.NewRGB(245, 246, 248), URL: "/",
		EnableFileDrop: true,
	})
	window.OnWindowEvent(events.Common.WindowFilesDropped, func(event *application.WindowEvent) {
		app.Event.Emit("defaultapps:files-dropped", event.Context().DroppedFiles())
	})
	picker.App, picker.Window = app, window
	window.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		allowed := changeService.RequestQuit()
		traceQuitHook("WindowClosing", allowed)
		if !allowed {
			event.Cancel()
		}
	})
	setupLifecycleSmoke(app, window)
	setupManualSmoke(app, window)
	setupForegroundRefresh(app)
	window.OnWindowEvent(events.Common.WindowRuntimeReady, func(*application.WindowEvent) {
		application.InvokeAsync(func() { native.SetContentMinimum(window.NativeWindow(), 1000, 700) })
		appupdate.Start(updateService)
	})
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
