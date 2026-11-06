//go:build darwin && cgo && !change_smoke

package main

import (
	"testing"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/change"
	"github.com/sunven/default-apps/internal/native"
)

func TestProductionOffersFileAndSchemeChangesThroughOneCoordinator(t *testing.T) {
	store, system, reader, dispatcher, kinds := changeEnvironment(t.TempDir())
	service := change.NewService(catalog.NewService(native.Adapter{}), association.NewService(system), reader, store, dispatcher, change.Options{WritableKinds: kinds})
	snapshot := service.GetSnapshot()
	if len(snapshot.WritableKinds) != 2 || snapshot.WritableKinds[0] != "file" || snapshot.WritableKinds[1] != "scheme" {
		t.Fatalf("both file type and scheme changes must be available: %v", snapshot.WritableKinds)
	}
}
