//go:build !update_smoke

package main

import "github.com/sunven/default-apps/internal/appupdate"

func configureUpdateSource(options appupdate.Options) appupdate.Options { return options }
