package main

import (
	"embed"
	"log"
	"os"
	"path/filepath"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/discovery"
	"github.com/sunven/default-apps/internal/native"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

func init() { application.RegisterEvent[discovery.Snapshot]("defaultapps:catalog") }

func main() {
	home, err := os.UserHomeDir()
	if err != nil {
		log.Fatal(err)
	}
	catalogService := catalog.NewService(native.Adapter{})
	var app *application.App
	discoveryService := discovery.NewService(native.Adapter{}, catalogService, []string{"/Applications", filepath.Join(home, "Applications"), "/System/Applications"}, func(snapshot discovery.Snapshot) { app.Event.Emit("defaultapps:catalog", snapshot) })
	app = application.New(application.Options{
		Name:        "Default Apps",
		Description: "查看与管理 macOS 文件类型和 URL 协议的默认应用",
		Services:    []application.Service{application.NewService(association.NewService(native.Adapter{})), application.NewService(catalogService), application.NewService(discoveryService)},
		Assets:      application.AssetOptions{Handler: application.AssetFileServerFS(assets)},
		Mac:         application.MacOptions{ApplicationShouldTerminateAfterLastWindowClosed: true},
	})
	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name: "main", Title: "Default Apps", Width: 1180, Height: 800,
		BackgroundColour: application.NewRGB(245, 246, 248), URL: "/",
	})
	window.OnWindowEvent(events.Common.WindowRuntimeReady, func(*application.WindowEvent) {
		application.InvokeAsync(func() { native.SetContentMinimum(window.NativeWindow(), 1000, 700) })
	})
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
