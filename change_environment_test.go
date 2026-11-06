//go:build darwin && cgo && !change_smoke

package main

import (
	"testing"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/change"
	"github.com/sunven/default-apps/internal/native"
)

func TestProductionOffersFileTypeChangesOnly(t *testing.T) {
	store, system, reader, dispatcher, kinds := changeEnvironment(t.TempDir())
	service := change.NewService(catalog.NewService(native.Adapter{}), association.NewService(system), reader, store, dispatcher, change.Options{WritableKinds: kinds})
	snapshot := service.GetSnapshot()
	if len(snapshot.WritableKinds) != 1 || snapshot.WritableKinds[0] != "file" {
		t.Fatalf("file type change must be available while URL scheme change stays disabled: %v", snapshot.WritableKinds)
	}
}
