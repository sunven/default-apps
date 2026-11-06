//go:build !change_smoke

package main

import (
	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/change"
	"github.com/sunven/default-apps/internal/config"
	"github.com/sunven/default-apps/internal/native"
)

// Native writes remain disabled until the file/protocol integration tickets.
func changeEnvironment(home string) (*config.Store, association.SystemAdapter, change.ApplicationReader, change.Dispatcher, []string) {
	return config.NewStore(configurationPath(home)), native.Adapter{}, native.Adapter{}, change.DisabledDispatcher{}, nil
}
