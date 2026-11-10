package appupdate

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/updater"
)

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
