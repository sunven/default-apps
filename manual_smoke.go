//go:build manual_smoke && darwin && cgo

package main

/*
#cgo CFLAGS: -fobjc-arc -mmacosx-version-min=13.0
#cgo LDFLAGS: -framework AppKit -framework WebKit
#include <stdlib.h>
char *manual_smoke_panel(const char *command,const char *path);
*/
import "C"
import (
	"encoding/json"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"os"
	"path/filepath"
	"time"
	"unsafe"
)

func setupManualSmoke(app *application.App, window *application.WebviewWindow) {
	root := os.Getenv("DEFAULT_APPS_MANUAL_SMOKE_ROOT")
	window.OnWindowEvent(events.Common.WindowRuntimeReady, func(*application.WindowEvent) {
		go func() {
			commands := filepath.Join(root, "panel-command.json")
			for {
				data, err := os.ReadFile(commands)
				if err != nil {
					time.Sleep(100 * time.Millisecond)
					continue
				}
				if err = os.Remove(commands); err != nil {
					continue
				}
				var command struct {
					Command string `json:"command"`
					Path    string `json:"path"`
				}
				if err = json.Unmarshal(data, &command); err != nil {
					continue
				}
				result := application.InvokeSyncWithResult(func() string {
					name, path := C.CString(command.Command), C.CString(command.Path)
					defer C.free(unsafe.Pointer(name))
					defer C.free(unsafe.Pointer(path))
					response := C.manual_smoke_panel(name, path)
					defer C.free(unsafe.Pointer(response))
					return C.GoString(response)
				})
				_ = os.WriteFile(filepath.Join(root, "panel-result.json"), []byte(result), 0600)
			}
		}()
	})
}
