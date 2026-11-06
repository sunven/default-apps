package main

import (
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

func init() { application.RegisterEvent[bool]("defaultapps:activated") }

// Native activation asks the current frontend to refresh its visible associations.
// The UI owns visibility and coalesces bursts; no catalog-wide timer is involved.
func setupForegroundRefresh(app *application.App) {
	app.Event.OnApplicationEvent(events.Mac.ApplicationDidBecomeActive, func(*application.ApplicationEvent) { app.Event.Emit("defaultapps:activated", true) })
}
