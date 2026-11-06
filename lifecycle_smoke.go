//go:build lifecycle_smoke && darwin && cgo

package main

/*
#cgo CFLAGS: -fobjc-arc -mmacosx-version-min=13.0
#cgo LDFLAGS: -framework AppKit -framework WebKit
#include <stdlib.h>
char *lifecycle_smoke_action(void *window, const char *command);
*/
import "C"
import (
	"encoding/json"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"os"
	"path/filepath"
	"sync"
	"time"
	"unsafe"
)

var lifecycleHookTrace = make(chan map[string]any, 100)

func traceQuitHook(route string, allowed bool) {
	select {
	case lifecycleHookTrace <- map[string]any{"route": route, "allowed": allowed, "at": time.Now().UTC().Format(time.RFC3339Nano)}:
	default:
	}
}
func setupLifecycleSmoke(_ *application.App, window *application.WebviewWindow) {
	root := os.Getenv("DEFAULT_APPS_CHANGE_SMOKE_ROOT")
	if root == "" {
		panic("lifecycle_smoke requires isolated smoke root")
	}
	go func() {
		for value := range lifecycleHookTrace {
			data, _ := json.Marshal(value)
			file, err := os.OpenFile(filepath.Join(root, "quit-hooks.jsonl"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
			if err == nil {
				file.Write(append(data, '\n'))
				file.Close()
			}
		}
	}()
	var once sync.Once
	window.OnWindowEvent(events.Common.WindowRuntimeReady, func(*application.WindowEvent) {
		once.Do(func() {
			go func() {
				for {
					data, err := os.ReadFile(filepath.Join(root, "native-command.json"))
					if err != nil {
						time.Sleep(50 * time.Millisecond)
						continue
					}
					if os.Remove(filepath.Join(root, "native-command.json")) != nil {
						continue
					}
					var command struct {
						Action string `json:"action"`
					}
					if json.Unmarshal(data, &command) != nil {
						continue
					}
					result := application.InvokeSyncWithResult(func() string {
						name := C.CString(command.Action)
						defer C.free(unsafe.Pointer(name))
						response := C.lifecycle_smoke_action(window.NativeWindow(), name)
						defer C.free(unsafe.Pointer(response))
						return C.GoString(response)
					})
					os.WriteFile(filepath.Join(root, "native-result.json"), []byte(result), 0600)
				}
			}()
		})
	})
}
