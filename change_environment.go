//go:build !change_smoke

package main

import (
	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/change"
	"github.com/sunven/default-apps/internal/config"
	"github.com/sunven/default-apps/internal/native"
)

// File changes share the durable coordinator; URL schemes remain read-only until
// their native integration is accepted.
func changeEnvironment(home string) (*config.Store, association.SystemAdapter, change.ApplicationReader, change.Dispatcher, []string) {
	return config.NewStore(configurationPath(home)), native.Adapter{}, native.Adapter{}, native.Dispatcher{}, []string{"file"}
}
