//go:build !darwin || !cgo

package appupdate

import (
	"net/http"
	"net/url"
)

func systemProxy(*http.Request) (*url.URL, error) { return nil, nil }
