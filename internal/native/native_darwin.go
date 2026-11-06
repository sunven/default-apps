//go:build darwin && cgo

// Package native translates public macOS APIs into Go-owned values.
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
	"github.com/sunven/default-apps/internal/discovery"
	"github.com/wailsapp/wails/v3/pkg/application"
)

type Adapter struct{}

func (Adapter) ReadApplication(ctx context.Context, path string) (discovery.Bundle, error) {
	if err := ctx.Err(); err != nil {
		return discovery.Bundle{}, err
	}
	value := C.CString(path)
	defer C.free(unsafe.Pointer(value))
	data := C.default_apps_read_application(value)
	if data == nil {
		return discovery.Bundle{}, errors.New("无法读取应用声明")
	}
	defer C.free(unsafe.Pointer(data))
	var response struct {
		discovery.Bundle
		Error string `json:"error"`
	}
	if err := json.Unmarshal([]byte(C.GoString(data)), &response); err != nil {
		return discovery.Bundle{}, err
	}
	if response.Error != "" {
		return response.Bundle, errors.New(response.Error)
	}
	return response.Bundle, nil
}
func (Adapter) ResolveExtension(ctx context.Context, value string) ([]catalog.ResolvedType, error) {
	return resolveType(ctx, "extension", value)
}
func (Adapter) ResolveIdentifier(ctx context.Context, value string) ([]catalog.ResolvedType, error) {
	return resolveType(ctx, "identifier", value)
}
func (Adapter) ResolveMIME(ctx context.Context, value string) ([]catalog.ResolvedType, error) {
	return resolveType(ctx, "mime", value)
}
func resolveType(ctx context.Context, kind, value string) ([]catalog.ResolvedType, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	nativeKind, nativeValue := C.CString(kind), C.CString(value)
	defer C.free(unsafe.Pointer(nativeKind))
	defer C.free(unsafe.Pointer(nativeValue))
	data := C.default_apps_resolve_type(nativeKind, nativeValue)
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

// IdentifyFile asks URL resource metadata for the content type; it does not open
// the contents or call any per-file association API.
func (Adapter) IdentifyFile(ctx context.Context, path string) (catalog.ResolvedType, error) {
	if err := ctx.Err(); err != nil {
		return catalog.ResolvedType{}, err
	}
	value := C.CString(path)
	defer C.free(unsafe.Pointer(value))
	data := C.default_apps_identify_file(value)
	if data == nil {
		return catalog.ResolvedType{}, errors.New("无法读取文件类型")
	}
	defer C.free(unsafe.Pointer(data))
	var response struct {
		Type  catalog.ResolvedType `json:"type"`
		Error string               `json:"error"`
	}
	if err := json.Unmarshal([]byte(C.GoString(data)), &response); err != nil {
		return response.Type, err
	}
	if response.Error != "" {
		return response.Type, errors.New(response.Error)
	}
	return response.Type, nil
}
