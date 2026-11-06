#!/bin/sh
set -eu
cd /Users/sunven/github/default-apps
review_app='bin/Default Apps Review QA.app'
mkdir -p "$review_app/Contents/MacOS"
CGO_CFLAGS='-mmacosx-version-min=13.0' CGO_LDFLAGS='-mmacosx-version-min=13.0' MACOSX_DEPLOYMENT_TARGET=13.0 go build -tags production,mcp,manual_smoke,lifecycle_smoke,change_smoke -o "$review_app/Contents/MacOS/default-apps"
cp build/darwin/Info.plist "$review_app/Contents/Info.plist"
codesign --force --sign - "$review_app"
codesign --verify --strict "$review_app"
