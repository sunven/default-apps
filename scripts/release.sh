#!/bin/bash
# One-command release: version, commit, annotated tag, then atomic push.
set -Eeuo pipefail

usage() {
  cat <<'HELP'
用法：
  ./scripts/release.sh                 自动递增 PATCH，确认后发布
  ./scripts/release.sh 0.2.0           发布指定稳定版本
  ./scripts/release.sh --dry-run       预览步骤，不修改文件或访问远端
  ./scripts/release.sh --yes           跳过交互确认，供自动化使用

要求：从干净的 main 分支运行，origin/main 可读取且没有未合并的新提交。
推送标签后由 GitHub Actions 构建 macOS Apple Silicon 应用并发布 Release。
HELP
}
fail() { printf '错误：%s\n' "$*" >&2; exit 1; }

release_version=''
release_yes=false
release_dry_run=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --yes|-y) release_yes=true ;;
    --dry-run) release_dry_run=true ;;
    -*) fail "未知选项：$1" ;;
    *) [ -z "$release_version" ] || fail '只能指定一个版本号。'; release_version=$1 ;;
  esac
  shift
done

cd "$(dirname "${BASH_SOURCE[0]}")/.."
command -v git >/dev/null || fail '未找到 Git。'
command -v node >/dev/null || fail '未找到 Node.js。'
[ "$(git rev-parse --show-toplevel)" = "$PWD" ] || fail '请在 Default Apps 仓库中运行。'
[ "$(git symbolic-ref --quiet --short HEAD)" = main ] || fail '请切换到 main 分支后发布。'
[ -z "$(git status --porcelain --untracked-files=all)" ] || fail '工作目录有未提交或未跟踪的文件，请先检查并提交。'
git remote get-url origin >/dev/null || fail '未配置 origin 远端。'
node scripts/version.mjs check

current_version=$(node scripts/version.mjs print)
release_version=$(node --input-type=module - "$current_version" "$release_version" <<'JS'
const [current, requested] = process.argv.slice(2)
const pattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
if (!pattern.test(current)) throw Error('当前版本不是有效的稳定版本')
const parts = current.split('.').map(BigInt)
const next = requested || `${parts[0]}.${parts[1]}.${parts[2] + 1n}`
if (!pattern.test(next)) throw Error('版本格式必须为 X.Y.Z，例如 0.2.0')
const target = next.split('.').map(BigInt)
const difference = target.findIndex((part, i) => part !== parts[i])
if (difference < 0 || target[difference] < parts[difference]) throw Error('发布版本必须高于当前版本')
console.log(next)
JS
)
release_tag="v$release_version"
if git show-ref --verify --quiet "refs/tags/$release_tag"; then
  fail "本地标签 $release_tag 已存在。"
fi

printf '\n准备发布 Default Apps %s → %s\n' "$current_version" "$release_version"
if "$release_dry_run"; then
  cat <<PLAN
1. 检查远端 main 与标签 $release_tag
2. 同步版本文件并校验 $release_version
3. 创建版本提交和注释标签 $release_tag
4. 原子推送 main 与 ${release_tag}，触发 GitHub Actions
预览完成：未修改文件，未访问远端，未提交或推送。
PLAN
  exit 0
fi

printf '\n检查远端 main 与版本标签…\n'
git fetch --no-tags origin refs/heads/main
git merge-base --is-ancestor FETCH_HEAD HEAD || fail '远端 main 有本地尚未合并的提交，请先同步。'
remote_tag=$(git ls-remote --tags origin "refs/tags/$release_tag") || fail '无法检查远端标签。'
[ -z "$remote_tag" ] || fail "远端标签 $release_tag 已存在。"

if ! "$release_yes"; then
  printf '\n将更新版本、创建提交与标签，并推送以触发正式发布。继续？[y/N] '
  reply=''
  if ! read -r reply; then reply=''; fi
  case "$reply" in
    y|Y|yes|YES) ;;
    *) printf '已取消，未修改版本或创建提交。\n'; exit 0 ;;
  esac
fi

printf '\n[1/4] 同步版本…\n'
node scripts/version.mjs set "$release_version"
node scripts/version.mjs check

printf '\n[2/4] 提交版本…\n'
git add -- internal/buildinfo/version.txt build/config.yml build/darwin/Info.plist build/darwin/Info.dev.plist frontend/package.json frontend/package-lock.json
git commit -m "chore(release): prepare v$release_version"

printf '\n[3/4] 创建标签…\n'
git tag -a "$release_tag" -m "Default Apps $release_tag"

printf '\n[4/4] 推送 main 和标签…\n'
if ! git push --atomic origin HEAD:refs/heads/main "refs/tags/$release_tag"; then
  printf '推送失败。本地版本提交和标签已保留；解决问题后可重试：\n  git push --atomic origin HEAD:refs/heads/main refs/tags/%s\n' "$release_tag" >&2
  exit 1
fi

printf '\n已推送 %s，GitHub Actions 将构建并发布 macOS Apple Silicon 版本。\n' "$release_tag"
printf '构建进度：https://github.com/sunven/default-apps/actions\n'
printf '发布页面：https://github.com/sunven/default-apps/releases/tag/%s\n' "$release_tag"
