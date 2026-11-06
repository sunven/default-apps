#!/bin/sh
set -eu
wails3 generate bindings -ts -i -clean=true
npm --prefix frontend run build
CGO_CFLAGS='-mmacosx-version-min=13.0' CGO_LDFLAGS='-mmacosx-version-min=13.0' go build -tags production,mcp,manual_smoke,change_smoke,lifecycle_smoke -o bin/lifecycle-smoke
mkdir -p 'bin/Default Apps Lifecycle QA.app/Contents/MacOS' 'bin/Default Apps Lifecycle QA.app/Contents/Resources'
cp bin/lifecycle-smoke 'bin/Default Apps Lifecycle QA.app/Contents/MacOS/default-apps'
cp build/darwin/Info.plist 'bin/Default Apps Lifecycle QA.app/Contents/Info.plist'
codesign --force --sign - 'bin/Default Apps Lifecycle QA.app'
codesign --verify --strict --verbose=2 'bin/Default Apps Lifecycle QA.app'
