// Package manualassociations owns confirmed manual choices and their restoration.
package manualassociations

import (
	"context"
	"fmt"
	"strings"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/config"
)

type Choice struct {
	Kind       string // extension, scheme or identifier
	Value      string // Original input, retained for future resolution.
	SelectedID string // Required for extension and scheme; identifier selects itself.
}

type Restoration struct {
	Entries      []catalog.Entry
	Applications []association.AppCopy // Saved copies from the same configuration read.
	Problems     []error               // Individual resolution errors, not load errors.
}

type Collection struct {
	catalog *catalog.Service
	store   config.Repository
}

// New uses the shared repository so association, application and pending-request
// updates retain the complete document under the same atomic update lock.
func New(types *catalog.Service, store config.Repository) *Collection {
	return &Collection{catalog: types, store: store}
}

// Save resolves again before committing; callers cannot persist fabricated entries.
// Duplicate choices still commit successfully and return the current resolution.
func (c *Collection) Save(ctx context.Context, choice Choice) (catalog.Entry, error) {
	input := catalog.Input{Kind: choice.Kind, Value: choice.Value, Label: strings.TrimSpace(choice.Value), Source: "manual"}
	switch choice.Kind {
	case "extension", "scheme":
	case "identifier":
		input.Label, input.Origin = choice.Value, "file"
	default:
		return catalog.Entry{}, fmt.Errorf("请选择扩展名或 URL 协议")
	}
	entries, err := c.catalog.Resolve(ctx, []catalog.Input{input})
	if err != nil {
		return catalog.Entry{}, err
	}
	var selected *catalog.Entry
	for i := range entries {
		if !entries[i].Resolved {
			continue
		}
		if choice.Kind == "identifier" {
			if entries[i].Association.Key == choice.Value {
				selected = &entries[i]
				break
			}
		} else if entries[i].ID == choice.SelectedID {
			selected = &entries[i]
		}
	}
	if selected == nil {
		if choice.Kind == "identifier" {
			return catalog.Entry{}, fmt.Errorf("文件类型仍未解析，不能添加")
		}
		return catalog.Entry{}, fmt.Errorf("请明确选择一个已解析的关联项；未解析项不能添加")
	}
	err = c.store.Update(ctx, func(doc *config.Document) error {
		for _, existing := range doc.Associations {
			if existing.SelectedID == selected.ID && existing.Input.Kind == input.Kind && strings.EqualFold(strings.TrimSpace(existing.Input.Value), strings.TrimSpace(input.Value)) {
				return nil
			}
		}
		doc.Associations = append(doc.Associations, config.ManualAssociation{Input: input, SelectedID: selected.ID})
		return nil
	})
	if err != nil {
		return catalog.Entry{}, err
	}
	return *selected, nil
}

// Restore rechecks every saved input without modifying the configuration. Only
// its chosen identity is restored; a missing choice keeps an unavailable entry.
func (c *Collection) Restore(ctx context.Context) (Restoration, error) {
	doc, err := c.store.Load(ctx)
	if err != nil {
		return Restoration{}, err
	}
	result := Restoration{Entries: []catalog.Entry{}, Applications: doc.Applications, Problems: []error{}}
	for _, saved := range doc.Associations {
		resolved, err := c.catalog.Resolve(ctx, []catalog.Input{saved.Input})
		if err != nil {
			result.Problems = append(result.Problems, err)
			continue
		}
		matched := false
		for _, entry := range resolved {
			if entry.ID == saved.SelectedID {
				result.Entries = catalog.Merge(result.Entries, []catalog.Entry{entry})
				matched = true
			}
		}
		if !matched {
			result.Entries = catalog.Merge(result.Entries, []catalog.Entry{unavailableEntry(saved)})
		}
	}
	return result, nil
}

// UnavailablePrefix is the existing directory identity used by reparse matching.
const UnavailablePrefix = "unavailable:"

func unavailableEntry(saved config.ManualAssociation) catalog.Entry {
	return catalog.Entry{
		ID: UnavailablePrefix + saved.SelectedID, Association: association.Association{Kind: "file"},
		Name: saved.Input.Label, Extensions: []string{}, MIMETypes: []string{},
		Sources:          []catalog.Source{{Kind: "manual", InputKind: saved.Input.Kind, RawInput: saved.Input.Value}},
		UnresolvedReason: "先前选择的类型现在无法解析：" + saved.SelectedID, DiagnosticIdentifiers: []string{saved.SelectedID},
	}
}
