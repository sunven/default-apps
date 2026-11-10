package buildinfo

import (
	"embed"
	"strings"
)

// Files keeps the release version in one source shared by Go and build scripts.
//
//go:embed version.txt
var Files embed.FS

func Version() string {
	data, _ := Files.ReadFile("version.txt")
	return strings.TrimSpace(string(data))
}
