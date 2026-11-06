package main

import (
	"context"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// NativePicker belongs to the Wails shell. Prompts run on the service goroutine;
// Wails dispatches AppKit creation and waits without blocking the main run loop.
type NativePicker struct {
	App    *application.App
	Window *application.WebviewWindow
}

func (p *NativePicker) PickFile(ctx context.Context) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	return p.App.Dialog.OpenFile().SetTitle("选择文件以识别整类类型").AttachToWindow(p.Window).CanChooseFiles(true).CanChooseDirectories(false).CanCreateDirectories(false).ResolvesAliases(true).TreatsFilePackagesAsDirectories(false).PromptForSingleSelection()
}
func (p *NativePicker) PickApplication(ctx context.Context) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	return p.App.Dialog.OpenFile().SetTitle("选择一个应用副本").AttachToWindow(p.Window).CanChooseFiles(true).CanChooseDirectories(false).CanCreateDirectories(false).ResolvesAliases(true).TreatsFilePackagesAsDirectories(false).AddFilter("应用", "*.app").AllowsOtherFileTypes(false).SetDirectory("/Applications").PromptForSingleSelection()
}
