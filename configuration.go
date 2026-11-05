//go:build !manual_smoke

package main

import "path/filepath"

func configurationPath(home string) string {
	return filepath.Join(home, "Library", "Application Support", "Default Apps", "config.json")
}
