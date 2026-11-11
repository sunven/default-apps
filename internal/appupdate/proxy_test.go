package appupdate

import (
	"errors"
	"net/http"
	"net/url"
	"testing"
)

func TestProxySelectionRespectsEnvironmentAndSystemChanges(t *testing.T) {
	for _, tc := range []struct {
		name, scheme, key string
		excluded          bool
	}{
		{name: "Finder HTTPS launch uses system proxy", scheme: "https"},
		{name: "HTTP redirect uses system proxy", scheme: "http"},
		{name: "explicit HTTPS proxy", scheme: "https", key: "HTTPS_PROXY"},
		{name: "lowercase HTTPS proxy", scheme: "https", key: "https_proxy"},
		{name: "explicit HTTP proxy", scheme: "http", key: "HTTP_PROXY"},
		{name: "environment exclusion stays direct", scheme: "https", key: "HTTPS_PROXY", excluded: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			systemURL, _ := url.Parse("http://127.0.0.1:7890")
			environmentURL, _ := url.Parse("http://127.0.0.1:8080")
			if tc.excluded {
				environmentURL = nil
			}
			environmentCalls, systemCalls := 0, 0
			lookup := proxyWithSystemFallback(
				func(*http.Request) (*url.URL, error) { environmentCalls++; return environmentURL, nil },
				func(*http.Request) (*url.URL, error) { systemCalls++; return systemURL, nil },
				func(key string) string {
					if tc.key != "" && key == tc.key {
						return "configured"
					}
					return ""
				},
			)
			req, _ := http.NewRequest(http.MethodGet, tc.scheme+"://release-assets.githubusercontent.com/asset", nil)
			got, err := lookup(req)
			if err != nil {
				t.Fatal(err)
			}
			if tc.key != "" {
				if got != environmentURL || environmentCalls != 1 || systemCalls != 0 {
					t.Fatal("explicit environment settings were overridden")
				}
				return
			}
			if got != systemURL || environmentCalls != 0 || systemCalls != 1 {
				t.Fatal("system proxy was not selected")
			}
			systemURL = nil // Turning the system proxy off also affects retries.
			got, err = lookup(req)
			if err != nil || got != nil || systemCalls != 2 {
				t.Fatal("stale system proxy was reused")
			}
		})
	}
}

func TestProxyLookupFailureDoesNotSilentlyConnectDirectly(t *testing.T) {
	want := errors.New("proxy lookup failed")
	lookup := proxyWithSystemFallback(
		func(*http.Request) (*url.URL, error) { t.Fatal("unexpected environment lookup"); return nil, nil },
		func(*http.Request) (*url.URL, error) { return nil, want },
		func(string) string { return "" },
	)
	req, _ := http.NewRequest(http.MethodGet, "https://github.com", nil)
	if _, err := lookup(req); !errors.Is(err, want) {
		t.Fatalf("got %v, want %v", err, want)
	}
}
