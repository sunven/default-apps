package appupdate

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/wailsapp/wails/v3/pkg/updater"
)

func TestGitHubChecksumConnectionFailureIsActionable(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/releases/latest") {
			json.NewEncoder(w).Encode(map[string]any{
				"tag_name": "v0.2.0",
				"assets": []map[string]any{
					{"name": artifactName, "url": "https://api.github.com/repos/" + Repository + "/releases/assets/1"},
					{"name": "SHA256SUMS", "url": "https://release-assets.githubusercontent.com/checksums?sig=private-token"},
				},
			})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()
	client := server.Client()
	client.Transport = checksumConnectionFailure{base: client.Transport}
	provider, err := NewProvider(client, server.URL)
	if err != nil {
		t.Fatal(err)
	}
	s := testService(t, &fakeEngine{})
	engine := updater.New(&host{service: s})
	if err := engine.Init(updater.Config{CurrentVersion: "0.1.3", Providers: []updater.Provider{provider}, Window: updater.WindowNone}); err != nil {
		t.Fatal(err)
	}
	s.engine = engine
	s.Check()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) && s.GetSnapshot().Phase == "checking" {
		time.Sleep(time.Millisecond)
	}
	v := s.GetSnapshot()
	if v.Phase != "error" {
		t.Fatalf("expected failed check, got phase %s", v.Phase)
	}
	if strings.Contains(v.Error, "private-token") || strings.Contains(v.Error, "https://") {
		t.Fatal("update error exposes the signed download URL instead of a readable explanation")
	}
	if !strings.HasPrefix(v.Error, "检查更新失败：无法连接") {
		t.Fatalf("expected connection guidance, got %q", v.Error)
	}
}

type checksumConnectionFailure struct {
	base http.RoundTripper
	err  error
}

func (t checksumConnectionFailure) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.URL.Host == "release-assets.githubusercontent.com" {
		if t.err != nil {
			return nil, t.err
		}
		return nil, fmt.Errorf("dial tcp [::1]:443: connect: connection refused")
	}
	return t.base.RoundTrip(req)
}

func TestGitHubDownloadNetworkErrorsHideSignedURLs(t *testing.T) {
	for _, tc := range []struct {
		name, message string
		err           error
	}{
		{name: "connection refused", message: "无法连接"},
		{name: "timeout", message: "超时", err: context.DeadlineExceeded},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client := &http.Client{Transport: checksumConnectionFailure{err: tc.err}}
			provider, err := NewProvider(client, "")
			if err != nil {
				t.Fatal(err)
			}
			err = provider.Download(context.Background(), &updater.Release{Metadata: map[string]any{
				"github.asset.url": "https://release-assets.githubusercontent.com/archive?sig=private-token",
			}}, io.Discard, nil)
			if err == nil || !strings.Contains(err.Error(), tc.message) || strings.Contains(err.Error(), "private-token") || strings.Contains(err.Error(), "https://") {
				t.Fatal("download did not return a safe, actionable network error")
			}
		})
	}
}

func TestGitHubHTTPFailuresHaveReadableReasons(t *testing.T) {
	for _, tc := range []struct {
		status      int
		rateLimited bool
		message     string
	}{
		{status: 404, message: "无法读取发布源"},
		{status: 403, rateLimited: true, message: "请求次数已达上限"},
		{status: 429, message: "请求次数已达上限"},
		{status: 403, message: "HTTP 403"},
		{status: 503, message: "HTTP 503"},
	} {
		t.Run(fmt.Sprintf("%d rateLimited=%t", tc.status, tc.rateLimited), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if tc.rateLimited {
					w.Header().Set("X-RateLimit-Remaining", "0")
				}
				w.WriteHeader(tc.status)
				fmt.Fprint(w, `{"documentation_url":"https://example.com/?sig=private-token"}`)
			}))
			defer server.Close()
			provider, err := NewProvider(server.Client(), server.URL)
			if err != nil {
				t.Fatal(err)
			}
			_, err = provider.Check(context.Background(), updater.CheckRequest{CurrentVersion: "0.1.3", Platform: "darwin", Arch: "arm64"})
			var publicErr publicSourceError
			if !errors.As(err, &publicErr) || !strings.Contains(err.Error(), tc.message) {
				t.Fatalf("expected %q, got %v", tc.message, err)
			}
		})
	}
}

func TestGitHubSourceRequiresCompleteStableARM64Release(t *testing.T) {
	for _, tc := range []struct {
		name, tag, current  string
		checksum            bool
		digest              string
		status              int
		wantErr, wantUpdate bool
	}{
		{name: "new stable", tag: "v0.2.0", current: "0.1.0", checksum: true, wantUpdate: true},
		{name: "same", tag: "v0.1.0", current: "0.1.0"},
		{name: "older", tag: "v0.0.9", current: "0.1.0"},
		{name: "missing checksum", tag: "v0.2.0", current: "0.1.0", wantErr: true},
		{name: "bad checksum", tag: "v0.2.0", current: "0.1.0", checksum: true, digest: "abcd", wantErr: true},
		{name: "prerelease tag", tag: "v0.2.0-beta.1", current: "0.1.0", checksum: true, wantErr: true},
		{name: "not publicly readable", status: 404, current: "0.1.0", wantErr: true},
		{name: "rate limit", status: 403, current: "0.1.0", wantErr: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			payload := []byte("application archive")
			sum := sha256.Sum256(payload)
			digest := hex.EncodeToString(sum[:])
			if tc.digest != "" {
				digest = tc.digest
			}
			var server *httptest.Server
			server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch {
				case strings.HasSuffix(r.URL.Path, "/releases/latest"):
					if tc.status != 0 {
						w.WriteHeader(tc.status)
						return
					}
					assets := []map[string]any{{"name": "wrong-darwin-arm64.dmg", "url": server.URL + "/wrong"}, {"name": artifactName, "url": server.URL + "/asset", "size": len(payload)}}
					if tc.checksum {
						assets = append(assets, map[string]any{"name": "SHA256SUMS", "url": server.URL + "/checksums"})
					}
					json.NewEncoder(w).Encode(map[string]any{"tag_name": tc.tag, "name": tc.tag, "assets": assets})
				case r.URL.Path == "/checksums":
					fmt.Fprintf(w, "%s  %s\n", digest, artifactName)
				case r.URL.Path == "/asset":
					w.Write(payload)
				default:
					w.WriteHeader(404)
				}
			}))
			defer server.Close()
			provider, err := NewProvider(server.Client(), server.URL)
			if err != nil {
				t.Fatal(err)
			}
			rel, err := provider.Check(context.Background(), updater.CheckRequest{CurrentVersion: tc.current, Platform: "darwin", Arch: "arm64"})
			if (err != nil) != tc.wantErr {
				t.Fatalf("release=%+v error=%v", rel, err)
			}
			if (rel != nil) != tc.wantUpdate {
				t.Fatalf("release=%+v error=%v", rel, err)
			}
			if rel != nil && rel.Artifact.Filename != artifactName {
				t.Fatal(rel)
			}
		})
	}
}
