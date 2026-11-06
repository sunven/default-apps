#!/bin/sh
set -eu
export CGO_CFLAGS='-mmacosx-version-min=13.0'
export CGO_LDFLAGS='-mmacosx-version-min=13.0'
wails3 generate bindings -ts -i -clean=true
npm --prefix frontend run build
mkdir -p 'bin/Default Apps.app/Contents/MacOS' 'bin/Default Apps.app/Contents/Resources'
mkdir -p 'bin/Default Apps Native QA.app/Contents/MacOS' 'bin/Default Apps Native QA.app/Contents/Resources'
go build -tags production -o 'bin/Default Apps.app/Contents/MacOS/default-apps'
cp build/darwin/Info.plist 'bin/Default Apps.app/Contents/Info.plist'
codesign --force --sign - 'bin/Default Apps.app'
codesign --verify --strict --verbose=2 'bin/Default Apps.app'
go build -tags production,mcp,manual_smoke,lifecycle_smoke,native_acceptance -o 'bin/Default Apps Native QA.app/Contents/MacOS/default-apps'
cp build/darwin/Info.plist 'bin/Default Apps Native QA.app/Contents/Info.plist'
codesign --force --sign - 'bin/Default Apps Native QA.app'
codesign --verify --strict --verbose=2 'bin/Default Apps Native QA.app'
