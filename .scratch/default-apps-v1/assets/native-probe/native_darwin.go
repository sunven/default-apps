package main

/*
#cgo CFLAGS: -fobjc-arc -mmacosx-version-min=13.0
#cgo LDFLAGS: -framework AppKit -framework UniformTypeIdentifiers
#include <stdlib.h>
#include "native.h"
*/
import "C"

import (
	"encoding/json"
	"unsafe"
)

func query(kind, key string) map[string]any {
	k, v := C.CString(kind), C.CString(key)
	defer C.free(unsafe.Pointer(k))
	defer C.free(unsafe.Pointer(v))
	data := C.probe_query(k, v)
	defer C.free(unsafe.Pointer(data))
	var result map[string]any
	if err := json.Unmarshal([]byte(C.GoString(data)), &result); err != nil {
		panic(err)
	}
	return result
}

func submit(id uint64, kind, key, path string) {
	k, v, p := C.CString(kind), C.CString(key), C.CString(path)
	defer C.free(unsafe.Pointer(k))
	defer C.free(unsafe.Pointer(v))
	defer C.free(unsafe.Pointer(p))
	C.probe_submit(C.uint64_t(id), k, v, p)
}

func delayed(id uint64, milliseconds int) { C.probe_delayed(C.uint64_t(id), C.int(milliseconds)) }
func mainThread() bool                    { return C.probe_main_thread() != 0 }

//export goProbeCompletion
func goProbeCompletion(id C.uint64_t, data *C.char) {
	var result map[string]any
	if err := json.Unmarshal([]byte(C.GoString(data)), &result); err != nil {
		panic(err)
	}
	activeProbe.complete(uint64(id), result)
}
