//go:build update_smoke

package main

import (
	"net/http"
	"os"
	"strings"

	"github.com/sunven/default-apps/internal/appupdate"
)

// This test-only source override is absent from ordinary and developer builds.
func configureUpdateSource(options appupdate.Options) appupdate.Options {
	base := os.Getenv("DEFAULT_APPS_UPDATE_SMOKE_API")
	if !strings.HasPrefix(base, "http://127.0.0.1:") {
		panic("update_smoke requires an isolated loopback source")
	}
	provider, err := appupdate.NewProvider(&http.Client{}, base)
	if err != nil {
		panic(err)
	}
	options.Provider = provider
	return options
}
