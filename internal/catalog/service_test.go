package catalog_test

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/sunven/default-apps/internal/catalog"
)

type resolverStub struct {
	matches map[string][]catalog.ResolvedType
	errors  map[string]error
	inputs  []string
}

func (r *resolverStub) ResolveExtension(_ context.Context, extension string) ([]catalog.ResolvedType, error) {
	r.inputs = append(r.inputs, extension)
	return r.matches[extension], r.errors[extension]
}

func TestAliasesMergeSourcesWhileSharedExtensionsKeepDistinctTypes(t *testing.T) {
	jpeg := catalog.ResolvedType{Identifier: "public.jpeg", Name: "JPEG image", Extensions: []string{"jpeg", "jpg", "jpe"}, MIMETypes: []string{"image/jpeg"}, Declared: true}
	exported := catalog.ResolvedType{Identifier: "com.example.export.jpg", Name: "JPEG export", Extensions: []string{"jpg"}, Declared: true}
	service := catalog.NewService(&resolverStub{matches: map[string][]catalog.ResolvedType{"jpg": {jpeg, exported}, "jpeg": {jpeg}}})
	entries, err := service.Resolve(context.Background(), []catalog.Input{
		{Kind: "extension", Value: "jpg", Label: "JPEG", Source: "common"},
		{Kind: "extension", Value: "jpeg", Label: "JPEG", Source: "common"},
		{Kind: "extension", Value: "jpg", Label: "Editor.app", Source: "declaration"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 {
		t.Fatalf("shared extension must keep two identities: %#v", entries)
	}
	row := entries[0]
	if row.ID != "file:public.jpeg" || row.Association.Kind != "file" || row.Association.Key != "public.jpeg" || !row.Resolved {
		t.Fatalf("wrong resolved identity: %#v", row)
	}
	if !reflect.DeepEqual(row.Extensions, []string{"jpg", "jpeg", "jpe"}) || !reflect.DeepEqual(row.MIMETypes, []string{"image/jpeg"}) || len(row.Sources) != 3 {
		t.Fatalf("merged aliases and provenance lost: %#v", row)
	}
	if entries[1].Association.Key != "com.example.export.jpg" || len(entries[1].Sources) != 2 {
		t.Fatalf("ambiguous type must retain its own identity and sources: %#v", entries[1])
	}
}

func TestUnresolvedInputsRemainDistinctAndPreserveLocalFailures(t *testing.T) {
	service := catalog.NewService(&resolverStub{matches: map[string][]catalog.ResolvedType{
		"unknown":    {{Identifier: "dyn.example", Name: "generated", Dynamic: true}},
		"undeclared": {{Identifier: "com.example.undeclared"}},
		"pdf":        {{Identifier: "com.adobe.pdf", Declared: true}},
	}, errors: map[string]error{"broken": errors.New("resolver temporarily unavailable")}})
	entries, err := service.Resolve(context.Background(), []catalog.Input{
		{Kind: "extension", Value: "unknown", Source: "common"},
		{Kind: "extension", Value: "absent", Source: "common"},
		{Kind: "extension", Value: "broken", Source: "common"},
		{Kind: "extension", Value: "undeclared", Source: "common"},
		{Kind: "extension", Value: "pdf", Source: "common"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 5 {
		t.Fatalf("each unresolved input must survive beside usable entries: %#v", entries)
	}
	seen := map[string]bool{}
	for _, entry := range entries[:4] {
		if entry.Resolved || entry.Association.Key != "" || entry.UnresolvedReason == "" || seen[entry.ID] {
			t.Fatalf("unresolved input acquired usable or duplicate identity: %#v", entry)
		}
		seen[entry.ID] = true
	}
	if !reflect.DeepEqual(entries[0].DiagnosticIdentifiers, []string{"dyn.example"}) || !strings.Contains(entries[2].UnresolvedReason, "resolver temporarily unavailable") || !entries[4].Resolved {
		t.Fatalf("local failure or diagnostic lost: %#v", entries)
	}
}

func TestCommonCatalogResolvesEveryApprovedAliasAndKeepsSchemesIndependent(t *testing.T) {
	resolver := &resolverStub{}
	entries, err := catalog.NewService(resolver).List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"pdf", "txt", "text", "rtf", "md", "markdown", "jpg", "jpeg", "png", "gif", "tif", "tiff", "heic", "svg", "html", "htm", "json"}
	if !reflect.DeepEqual(resolver.inputs, want) {
		t.Fatalf("common seeds must pass through resolver: %v", resolver.inputs)
	}
	schemes := []string{}
	for _, entry := range entries {
		if entry.Association.Kind == "scheme" {
			schemes = append(schemes, entry.Association.Key)
		}
	}
	if !reflect.DeepEqual(schemes, []string{"http", "https", "mailto", "webcal"}) {
		t.Fatalf("missing independent protocol rows: %v", schemes)
	}
	normalized, err := catalog.NewService(resolver).Resolve(context.Background(), []catalog.Input{
		{Kind: "scheme", Value: " HTTP: ", Source: "common"},
		{Kind: "scheme", Value: "http", Source: "declaration"},
		{Kind: "scheme", Value: "https", Source: "common"},
		{Kind: "scheme", Value: "https://example.org", Source: "manual"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(normalized) != 3 || normalized[0].ID != "scheme:http" || len(normalized[0].Sources) != 2 || normalized[1].ID != "scheme:https" || normalized[2].Resolved {
		t.Fatalf("scheme normalization lost separate identity or accepted an URL: %#v", normalized)
	}
}

func TestExtensionNormalizationMergesAliasSourcesWithoutGuessingTypeIdentity(t *testing.T) {
	resolver := &resolverStub{matches: map[string][]catalog.ResolvedType{"jpg": {{Identifier: "public.jpeg", Declared: true, Extensions: []string{"jpeg"}}}}}
	entries, err := catalog.NewService(resolver).Resolve(context.Background(), []catalog.Input{
		{Kind: "extension", Value: " .JPG ", Source: "common"},
		{Kind: "extension", Value: "jpg", Source: "manual"},
		{Kind: "extension", Value: "*", Source: "manual"},
		{Kind: "extension", Value: "/tmp/photo.jpg", Source: "manual"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 3 || entries[0].ID != "file:public.jpeg" || len(entries[0].Sources) != 2 || entries[0].Sources[0].RawInput != " .JPG " || entries[0].Sources[0].NormalizedInput != "jpg" || entries[1].Resolved || entries[2].Resolved {
		t.Fatalf("normalization lost raw input or accepted unsafe guesses: %#v", entries)
	}
	if !reflect.DeepEqual(resolver.inputs, []string{"jpg", "jpg"}) {
		t.Fatalf("only valid extension tags may reach native resolver: %v", resolver.inputs)
	}
}

func TestRepeatedUnresolvedInputMergesProvenanceWithoutHidingAnotherUnknown(t *testing.T) {
	entries, err := catalog.NewService(&resolverStub{}).Resolve(context.Background(), []catalog.Input{
		{Kind: "extension", Value: "odd", Source: "common"},
		{Kind: "extension", Value: ".ODD", Source: "manual"},
		{Kind: "extension", Value: "other", Source: "common"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 || len(entries[0].Sources) != 2 || entries[0].ID == entries[1].ID {
		t.Fatalf("unresolved catalog rows must preserve normalized-input identity and all sources: %#v", entries)
	}
}
