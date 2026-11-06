//go:build !lifecycle_smoke

package main

import "github.com/wailsapp/wails/v3/pkg/application"

func setupLifecycleSmoke(*application.App, *application.WebviewWindow) {}
func traceQuitHook(string, bool)                                       {}
