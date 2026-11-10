package appupdate

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
)

const Repository = "sunven/default-apps"
const ReleaseURL = "https://github.com/" + Repository + "/releases/latest"
const artifactName = "default-apps-darwin-arm64.zip"

// GitHub's stock provider treats 404 as up to date and a missing checksum as
// optional. Enforce the product's explicit failure and integrity requirements.
type requiredChecksum struct{ updater.Provider }

func (p requiredChecksum) Check(ctx context.Context, req updater.CheckRequest) (*updater.Release, error) {
	r, err := p.Provider.Check(ctx, req)
	if err != nil || r == nil {
		return r, err
	}
	if r.Channel != "stable" || strings.Contains(r.Version, "-") {
		return nil, errors.New("发布源返回了非稳定版本。")
	}
	if r.Artifact.Filename != artifactName {
		return nil, errors.New("更新包名称不匹配。")
	}
	if r.Verification == nil || r.Verification.DigestAlgo != "sha256" || len(r.Verification.Digest) != sha256.Size {
		return nil, errors.New("发布版本缺少有效的 SHA-256 校验，暂不能下载。")
	}
	return r, nil
}

type releaseTransport struct{ base http.RoundTripper }

func (t releaseTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	resp, err := t.base.RoundTrip(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode == http.StatusNotFound && strings.HasSuffix(req.URL.Path, "/releases/latest") {
		resp.Body.Close()
		return nil, errors.New("无法读取发布源：仓库或正式版本不存在，或尚未开放公开读取。")
	}
	return resp, nil
}

func NewProvider(client *http.Client, baseURL string) (updater.Provider, error) {
	if client == nil {
		client = &http.Client{}
	}
	copyClient := *client
	base := copyClient.Transport
	if base == nil {
		base = http.DefaultTransport
	}
	copyClient.Transport = releaseTransport{base: base}
	p, err := github.New(github.Config{
		Repository: Repository, BaseURL: baseURL, HTTPClient: &copyClient, ChecksumAsset: "SHA256SUMS",
		AssetMatcher: func(req updater.CheckRequest, assets []github.ReleaseAsset) int {
			if req.Platform != "darwin" || req.Arch != "arm64" {
				return -1
			}
			found := -1
			for i, a := range assets {
				if a.Name == artifactName {
					if found != -1 {
						return -1
					}
					found = i
				}
			}
			return found
		},
	})
	if err != nil {
		return nil, fmt.Errorf("配置发布源：%w", err)
	}
	return requiredChecksum{p}, nil
}
