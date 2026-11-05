//go:build manual_smoke

package main

import (
	"os"
	"path/filepath"
)

// Test builds require an explicit isolated root. Ordinary builds have no override.
func configurationPath(home string) string {
	root := os.Getenv("DEFAULT_APPS_MANUAL_SMOKE_ROOT")
	if root == "" {
		panic("manual_smoke requires DEFAULT_APPS_MANUAL_SMOKE_ROOT")
	}
	return filepath.Join(root, "Application Support", "Default Apps", "config.json")
}
