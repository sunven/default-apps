#!/bin/sh
set -eu
# Run from worktree root. Ordinary builds omit both tags and use real user config.
npm --prefix frontend run build
CGO_CFLAGS='-mmacosx-version-min=13.0' CGO_LDFLAGS='-mmacosx-version-min=13.0' go build -tags production,mcp,manual_smoke -o bin/manual-smoke
mkdir -p 'bin/Default Apps Manual QA.app/Contents/MacOS' 'bin/Default Apps Manual QA.app/Contents/Resources'
cp bin/manual-smoke 'bin/Default Apps Manual QA.app/Contents/MacOS/default-apps'
cp build/darwin/Info.plist 'bin/Default Apps Manual QA.app/Contents/Info.plist'
codesign --force --sign - 'bin/Default Apps Manual QA.app'
codesign --verify --strict --verbose=2 'bin/Default Apps Manual QA.app'
