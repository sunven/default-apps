#!/bin/sh
# Prepare local version files only. Committing, tagging and pushing are explicit.
set -eu
cd "$(dirname "$0")/.."
[ "$#" -eq 1 ] || { echo 'Usage: sh scripts/prepare-release.sh X.Y.Z' >&2; exit 1; }
node scripts/version.mjs set "$1"
node scripts/version.mjs check
printf 'Version files prepared. Review and commit, then tag v%s and push that tag to trigger Release.\n' "$1"
