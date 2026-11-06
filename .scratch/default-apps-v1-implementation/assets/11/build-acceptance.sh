#!/bin/sh
set -eu
# Reuse the reviewed AppKit key driver only while compiling tagged acceptance apps.
cp .scratch/default-apps-v1-implementation/assets/04/harness/keyboard_evidence.go ticket11_keyboard.go
cp .scratch/default-apps-v1-implementation/assets/04/harness/keyboard_evidence.m ticket11_keyboard.m
trap 'rm -f ticket11_keyboard.go ticket11_keyboard.m' EXIT
export CGO_CFLAGS='-mmacosx-version-min=13.0'
export CGO_LDFLAGS='-mmacosx-version-min=13.0'
for mode in native controlled; do
  tags='production,mcp,manual_smoke,lifecycle_smoke,native_keyboard'
  if [ "$mode" = controlled ]; then tags="$tags,change_smoke"; fi
  target="bin/Default Apps Final $mode QA.app"
  mkdir -p "$target/Contents/MacOS"
  go build -tags "$tags" -o "$target/Contents/MacOS/default-apps"
  cp build/darwin/Info.plist "$target/Contents/Info.plist"
  codesign --force --sign - "$target"
  codesign --verify --strict "$target"
done
