package main

import (
	"crypto/sha256"
	"fmt"
	"path/filepath"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func newApplication(home string, options application.Options) *application.App {
	// Every installed copy and development build for this home shares config
	// and the change coordinator. Never scope the lock to the executable path,
	// build mode or version. Resolving the home also covers symlink aliases.
	if resolved, err := filepath.EvalSymlinks(home); err == nil {
		home = resolved
	}
	options.SingleInstance = &application.SingleInstanceOptions{
		UniqueID: fmt.Sprintf("io.github.sunven.default-apps.%x", sha256.Sum256([]byte(filepath.Clean(home)))),
		OnSecondInstanceLaunch: func(application.SecondInstanceData) {
			application.InvokeAsync(func() {
				app := application.Get()
				if window, ok := app.Window.GetByName("main"); ok {
					app.Show()
					window.UnMinimise()
					window.Show()
					window.Focus()
				}
			})
		},
	}
	return application.New(options)
}
