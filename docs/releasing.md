# 发布 Default Apps

本轮仅发布 macOS Apple Silicon。客户端查询 `sunven/default-apps` 的正式 GitHub Releases，只接受高于当前版本的稳定版本；首次安装带更新功能的版本需要手动完成。

## 版本与标签

唯一版本来源是 `internal/buildinfo/version.txt`，由 Go 直接嵌入。日常发布使用一键脚本：

```sh
./scripts/release.sh            # 自动递增 PATCH，例如 0.1.0 → 0.1.1
./scripts/release.sh 0.2.0      # 指定稳定版本
./scripts/release.sh --dry-run  # 仅预览，不修改或访问远端
```

脚本要求干净的 `main` 分支（包括暂存区和未跟踪文件），检查远端主分支及版本标签后请求一次确认；确认前不改版本或创建提交。然后同步全部版本文件、创建版本提交和注释标签，原子推送 `main` 与标签，触发 GitHub Actions。自动化可使用 `--yes` 跳过交互确认。版本必须高于当前版本，已有标签不会被覆盖。

脚本不在本机重复执行构建与测试，这些步骤由发布工作流完成；发布说明由 GitHub 自动生成。推送成功表示构建已触发，实际发布结果需查看 Actions。推送失败时保留本地版本提交和标签，并打印重试命令。仓库公开读取条件仍需满足下节要求。

`python3 scripts/test-release.py` 在临时 Git 仓库验证自动递增、指定版本、取消、离线预览、工作区检查、远端冲突和原子推送失败，不访问真实发布仓库。

仅准备本地版本文件时，可继续使用原有入口，同步构建配置、两份 plist、前端清单与锁文件：

```sh
sh scripts/prepare-release.sh 0.1.1
node scripts/version.mjs check
```

`prepare-release.sh` 仅修改本地版本文件，不提交、不打标签、不推送；后续需要自行提交并创建、推送与版本一致的 `vX.Y.Z` 标签。普通构建也会校验版本一致性；正式发布拒绝与版本来源不一致的标签。

## GitHub Actions

`.github/workflows/release.yml` 在推送 `v*` 标签后依次执行版本与公开读取检查、React 测试、前端构建、Go race 测试、ARM64 应用打包与发布产物校验。Go 主程序嵌入 `frontend/dist`，因此必须先构建前端再运行 Go 测试。先上传到草稿 Release，重新下载并检查摘要成功后才发布为最新正式版本。已有同名 Release 时失败，避免覆盖已发布产物。

使用工作流自带的 `GITHUB_TOKEN`，不需要 Apple 证书或更新签名密钥。`sunven/default-apps` 已设为公开，仓库与 Releases 必须保持可匿名读取。工作流使用自带令牌查询并检查仓库可见性，避免匿名 API 限流；客户端仍通过公开接口获取版本和附件，无需令牌。

发布附件为：

- `default-apps-darwin-arm64.zip`：唯一顶层为 `Default Apps.app`，客户端只选择这个附件。
- `SHA256SUMS`：该 ZIP 的 SHA-256。客户端缺少有效摘要时拒绝下载，内容不匹配时拒绝安装。
- `INSTALL.md`：首次安装与解除 quarantine 的操作说明。

应用名称及安装包目录统一为 `Default Apps.app`。已安装的旧名副本通过应用内升级时会保留原路径；如需同步名称，可先退出应用，再将旧副本重命名为 `Default Apps.app`。更新包附件名保持 `default-apps-darwin-arm64.zip`，供已有客户端继续识别。

版本、发布日期和更新说明使用 GitHub Release API 的 metadata，无需 Tauri 的 `latest.json`。自动生成的 Release notes 用于应用内更新说明，以纯文本展示。

## 本机构建产物

```sh
wails3 task darwin:package ARCH=arm64
python3 scripts/package-release.py
```

产物位于 `bin/release/`。打包脚本核对 bundle 身份、plist 与实际可执行程序的版本、ARM64 架构、现有 ad-hoc 签名完整性及 ZIP 结构，再生成摘要。它不上传或发布。

首次手动安装：下载解压，移至可写目录；如被 macOS 隔离，按真实路径执行以下命令，再重新打开：

```sh
xattr -dr com.apple.quarantine "/Applications/Default Apps.app"
```

## 安装与恢复边界

更新 ZIP 校验并暂存后仍需用户确认重启。存在结果未定的系统修改时，先显示退出说明；选择留下不会启动助手。重启前锁住新修改受理，助手准备好之后才真正退出；助手准备失败会解除门控。

只更新当前运行且父目录可写的应用副本，不提权。开发版、系统转移位置和不可写位置使用说明或手动发布页入口。下载仅在本次运行中保留，普通退出时清理暂存；不提供跨启动下载恢复、断点续传或新版崩溃后自动回滚。框架换包失败时尝试恢复旧版，但不提供断电事务或新版本健康检查保证。
