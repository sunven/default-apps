//go:build darwin && cgo

// Package native translates public macOS APIs into Go-owned values.
// No native setter is linked into this read-only slice.
package native

/*
#cgo CFLAGS: -fobjc-arc -mmacosx-version-min=13.0
#cgo LDFLAGS: -mmacosx-version-min=13.0 -framework AppKit -framework UniformTypeIdentifiers
#include "native.h"
*/
import "C"

import (
	"context"
	"encoding/json"
	"errors"
	"unsafe"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type Adapter struct{}

func (Adapter) ResolveExtension(ctx context.Context, extension string) ([]catalog.ResolvedType, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return application.InvokeSyncWithResultAndError(func() ([]catalog.ResolvedType, error) {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		value := C.CString(extension)
		defer C.free(unsafe.Pointer(value))
		data := C.default_apps_resolve_extension(value)
		if data == nil {
			return nil, errors.New("无法读取文件类型解析结果")
		}
		defer C.free(unsafe.Pointer(data))
		var response struct {
			Types []catalog.ResolvedType `json:"types"`
			Error string                 `json:"error"`
		}
		if err := json.Unmarshal([]byte(C.GoString(data)), &response); err != nil {
			return nil, err
		}
		if response.Error != "" {
			return nil, errors.New(response.Error)
		}
		return response.Types, nil
	})
}

func (Adapter) CurrentDefault(ctx context.Context, a association.Association) (*association.AppCopy, error) {
	result, err := query(ctx, a, false)
	return result.App, err
}
func (Adapter) CandidateApplications(ctx context.Context, a association.Association) ([]association.AppCopy, error) {
	result, err := query(ctx, a, true)
	return result.Apps, err
}

type queryResponse struct {
	App   *association.AppCopy  `json:"app"`
	Apps  []association.AppCopy `json:"apps"`
	Error string                `json:"error"`
}

func query(ctx context.Context, a association.Association, candidates bool) (queryResponse, error) {
	if err := ctx.Err(); err != nil {
		return queryResponse{}, err
	}
	// Invoked only from a bound query after the web runtime is ready, never in
	// ServiceStartup. Native objects stay inside the autorelease pool; JSON is
	// copied into Go before the malloc buffer is freed on this same invocation.
	return application.InvokeSyncWithResultAndError(func() (queryResponse, error) {
		if err := ctx.Err(); err != nil {
			return queryResponse{}, err
		}
		kind, key := C.CString(a.Kind), C.CString(a.Key)
		defer C.free(unsafe.Pointer(kind))
		defer C.free(unsafe.Pointer(key))
		var candidateFlag C.int
		if candidates {
			candidateFlag = 1
		}
		data := C.default_apps_query(kind, key, candidateFlag)
		if data == nil {
			return queryResponse{}, errors.New("无法读取原生查询结果")
		}
		defer C.free(unsafe.Pointer(data))
		var response queryResponse
		if err := json.Unmarshal([]byte(C.GoString(data)), &response); err != nil {
			return response, err
		}
		if response.Error != "" {
			return response, errors.New(response.Error)
		}
		return response, nil
	})
}

// SetContentMinimum runs on the Wails main thread after WindowRuntimeReady.
func SetContentMinimum(window unsafe.Pointer, width, height int) {
	C.default_apps_content_minimum(window, C.double(width), C.double(height))
}
