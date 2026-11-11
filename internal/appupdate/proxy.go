package appupdate

import (
	"net/http"
	"net/url"
	"os"
)

type proxyLookup func(*http.Request) (*url.URL, error)

func updateTransport() http.RoundTripper {
	base, ok := http.DefaultTransport.(*http.Transport)
	if !ok {
		return http.DefaultTransport
	}
	transport := base.Clone()
	transport.Proxy = proxyWithSystemFallback(http.ProxyFromEnvironment, systemProxy, os.Getenv)
	return transport
}

// Explicit environment proxies (including their NO_PROXY exclusions) take priority.
// Finder launches normally have none, so consult the current macOS settings on
// every request, including redirects to GitHub's release asset host.
func proxyWithSystemFallback(environment, system proxyLookup, getenv func(string) string) proxyLookup {
	return func(req *http.Request) (*url.URL, error) {
		keys := []string{"HTTP_PROXY", "http_proxy"}
		if req.URL.Scheme == "https" {
			keys = []string{"HTTPS_PROXY", "https_proxy"}
		}
		for _, key := range keys {
			if getenv(key) != "" {
				return environment(req)
			}
		}
		return system(req)
	}
}
