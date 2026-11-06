//go:build !change_smoke

package main

import (
	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/change"
	"github.com/sunven/default-apps/internal/config"
	"github.com/sunven/default-apps/internal/native"
)

// File types and URL schemes share one durable coordinator and global gate.
func changeEnvironment(home string) (*config.Store, association.SystemAdapter, change.ApplicationReader, change.Dispatcher, []string) {
	return config.NewStore(configurationPath(home)), native.Adapter{}, native.Adapter{}, native.Dispatcher{}, []string{"file", "scheme"}
}
