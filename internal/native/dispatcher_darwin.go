//go:build darwin && cgo

package native

/*
#include "native.h"
*/
import "C"

import (
	"sync"
	"unsafe"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/change"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// Dispatcher owns native completions independently of binding callers and UI.
// Only monotonically allocated integers cross the asynchronous C boundary.
type Dispatcher struct{}

// One external platform seam lets boundary tests control the Wails queue without
// creating another AppKit run loop. Production always uses this public API.
var invokeOnMain = application.InvokeAsync

var operations = struct {
	sync.Mutex
	next      uint64
	callbacks map[uint64]func(*change.NativeError)
}{callbacks: make(map[uint64]func(*change.NativeError))}

func (Dispatcher) Dispatch(a association.Association, target association.AppCopy, submitted func(), complete func(*change.NativeError)) {
	if a.Kind != "file" && a.Kind != "scheme" {
		go complete(&change.NativeError{Domain: "defaultapps.native", Code: 1, Description: "此关联种类尚未接入原生修改。"})
		return
	}
	operations.Lock()
	operations.next++
	id := operations.next
	operations.callbacks[id] = complete
	operations.Unlock()
	// Capture Go values, not temporary C buffers. InvokeAsync may run inline;
	// no registry lock is held during scheduling or native initiation.
	invokeOnMain(func() {
		key, path := C.CString(a.Key), C.CString(target.Path)
		defer C.free(unsafe.Pointer(key))
		defer C.free(unsafe.Pointer(path))
		submitted()
		if a.Kind == "scheme" {
			C.default_apps_set_url_scheme(C.uint64_t(id), key, path)
		} else {
			C.default_apps_set_file_type(C.uint64_t(id), key, path)
		}
	})
}

//export defaultAppsNativeCompleted
func defaultAppsNativeCompleted(id C.uint64_t, hasError C.int, domain *C.char, code C.int64_t, description *C.char) {
	// Native owns these bytes until this call returns. Copy on this callback's
	// arbitrary thread before scheduling any Go work, even during app teardown.
	var result *change.NativeError
	if hasError != 0 {
		result = &change.NativeError{Domain: C.GoString(domain), Code: int64(code), Description: C.GoString(description)}
	}
	operations.Lock()
	complete := operations.callbacks[uint64(id)]
	delete(operations.callbacks, uint64(id))
	operations.Unlock()
	if complete != nil {
		// The coordinator may publish and start independent readback. Never make
		// the system's completion thread wait for a window, query, or disk write.
		go complete(result)
	}
}
