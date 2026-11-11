package appupdate

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
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

type publicSourceError string

func (e publicSourceError) Error() string { return string(e) }

func (p requiredChecksum) Check(ctx context.Context, req updater.CheckRequest) (*updater.Release, error) {
	r, err := p.Provider.Check(ctx, req)
	if err != nil {
		return nil, sourceError(err)
	}
	if r == nil {
		return nil, nil
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

func (p requiredChecksum) Download(ctx context.Context, release *updater.Release, dst io.Writer, progress func(int64, int64)) error {
	return sourceError(p.Provider.Download(ctx, release, dst, progress))
}

// The engine flattens provider errors into strings. Translate them before that
// boundary so temporary signed URLs never reach notifications or the dialog.
func sourceError(err error) error {
	if err == nil {
		return nil
	}
	var publicErr publicSourceError
	if errors.As(err, &publicErr) {
		return publicErr
	}
	var requestErr *url.Error
	if errors.As(err, &requestErr) {
		var networkErr net.Error
		if errors.Is(err, context.DeadlineExceeded) || errors.As(err, &networkErr) && networkErr.Timeout() {
			return errors.New("连接更新服务器超时，请检查网络或系统代理后重试。")
		}
		return errors.New("无法连接更新服务器，请检查网络或系统代理后重试，也可打开发布页手动下载。")
	}
	return err
}

type releaseTransport struct{ base http.RoundTripper }

func (t releaseTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	resp, err := t.base.RoundTrip(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode == http.StatusNotFound && strings.HasSuffix(req.URL.Path, "/releases/latest") {
		resp.Body.Close()
		return nil, publicSourceError("无法读取发布源：仓库或正式版本不存在，或尚未开放公开读取。")
	}
	if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode == http.StatusForbidden && resp.Header.Get("X-RateLimit-Remaining") == "0" {
		resp.Body.Close()
		return nil, publicSourceError("GitHub 请求次数已达上限，请稍后重试，也可打开发布页手动下载。")
	}
	if resp.StatusCode == http.StatusForbidden || resp.StatusCode >= 500 {
		resp.Body.Close()
		return nil, publicSourceError(fmt.Sprintf("更新服务器暂不可用（HTTP %d），请稍后重试，也可打开发布页手动下载。", resp.StatusCode))
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
		base = updateTransport()
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
