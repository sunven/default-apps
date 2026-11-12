#!/bin/sh
set -eu
node scripts/version.mjs check
[ "$(go env GOVERSION)" = "go1.27.3" ] || { echo 'Build requires Go 1.27.3.' >&2; exit 1; }
[ "$(wails3 version 2>&1)" = "v3.1.0" ] || { echo 'Build requires Wails CLI 3.1.0.' >&2; exit 1; }
[ "$(go list -m -f '{{.Version}}' github.com/wailsapp/wails/v3)" = "v3.1.0" ] || { echo 'Build requires Wails Go module 3.1.0.' >&2; exit 1; }
node --input-type=module <<'JS'
import fs from 'node:fs';
const pkg=JSON.parse(fs.readFileSync('frontend/package.json','utf8'));
const lock=JSON.parse(fs.readFileSync('frontend/package-lock.json','utf8'));
if (pkg.dependencies['@wailsio/runtime'] !== '3.1.0' || lock.packages['node_modules/@wailsio/runtime'].version !== '3.1.0') throw Error('Build requires Wails runtime 3.1.0 in manifest and lockfile.');
if (!lock.packages['node_modules/react'].version.startsWith('19.') || !lock.packages['node_modules/react-dom'].version.startsWith('19.')) throw Error('Build requires React 19 for Astryx.');
JS
