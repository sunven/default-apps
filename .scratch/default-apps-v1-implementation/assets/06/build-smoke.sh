#!/bin/sh
set -eu
wails3 generate bindings -ts -i -clean=true
npm --prefix frontend run build
CGO_CFLAGS='-mmacosx-version-min=13.0' CGO_LDFLAGS='-mmacosx-version-min=13.0' go build -tags production,mcp,manual_smoke,change_smoke -o bin/change-smoke
mkdir -p 'bin/Default Apps Change QA.app/Contents/MacOS' 'bin/Default Apps Change QA.app/Contents/Resources'
cp bin/change-smoke 'bin/Default Apps Change QA.app/Contents/MacOS/default-apps'
cp build/darwin/Info.plist 'bin/Default Apps Change QA.app/Contents/Info.plist'
codesign --force --sign - 'bin/Default Apps Change QA.app'
codesign --verify --strict --verbose=2 'bin/Default Apps Change QA.app'
