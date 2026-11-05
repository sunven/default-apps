package main

import (
	"embed"
	"log"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/native"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := application.New(application.Options{
		Name:        "Default Apps",
		Description: "查看与管理 macOS 文件类型和 URL 协议的默认应用",
		Services:    []application.Service{application.NewService(association.NewService(native.Adapter{})), application.NewService(catalog.NewService(native.Adapter{}))},
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
