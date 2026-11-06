// Package manual owns explicit additions. Picker selection never changes a default.
package manual

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"sync"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/config"
	"github.com/sunven/default-apps/internal/discovery"
)

type SystemAdapter interface {
	ReadApplication(context.Context, string) (discovery.Bundle, error)
	IdentifyFile(context.Context, string) (catalog.ResolvedType, error)
}
type Picker interface {
	PickFile(context.Context) (string, error)
	PickApplication(context.Context) (string, error)
}
type Resolution struct {
	Entries   []catalog.Entry `json:"entries"`
	Cancelled bool            `json:"cancelled"`
	FileName  string          `json:"fileName"`
}
type Result struct {
	Saved     bool                 `json:"saved"`
	Cancelled bool                 `json:"cancelled"`
	Entry     *catalog.Entry       `json:"entry"`
	App       *association.AppCopy `json:"app"`
}
type Status struct {
	Error        string `json:"error"`
	Associations int    `json:"associations"`
	Applications int    `json:"applications"`
}
type Service struct {
	catalog  *catalog.Service
	system   SystemAdapter
	store    config.Repository
	picker   Picker
	changed  func()
	pickerMu sync.Mutex
}

func NewService(catalogService *catalog.Service, system SystemAdapter, store config.Repository, picker Picker, changed func()) *Service {
	return &Service{catalog: catalogService, system: system, store: store, picker: picker, changed: changed}
}
func (s *Service) GetStatus(ctx context.Context) Status {
	doc, err := s.store.Load(ctx)
	if err != nil {
		return Status{Error: err.Error()}
	}
	return Status{Associations: len(doc.Associations), Applications: len(doc.Applications)}
}
func (s *Service) ResolveInput(ctx context.Context, kind, value string) (Resolution, error) {
	if kind != "extension" && kind != "scheme" {
		return Resolution{}, fmt.Errorf("请选择扩展名或 URL 协议")
	}
	entries, err := s.catalog.Resolve(ctx, []catalog.Input{{Kind: kind, Value: value, Label: strings.TrimSpace(value), Source: "manual"}})
	return Resolution{Entries: entries}, err
}
func (s *Service) AddInput(ctx context.Context, kind, value, selectedID string) (Result, error) {
	resolution, err := s.ResolveInput(ctx, kind, value)
	if err != nil {
		return Result{}, err
	}
	var selected *catalog.Entry
	for i := range resolution.Entries {
		if resolution.Entries[i].ID == selectedID && resolution.Entries[i].Resolved {
			selected = &resolution.Entries[i]
		}
	}
	if selected == nil {
		return Result{}, fmt.Errorf("请明确选择一个已解析的关联项；未解析项不能添加")
	}
	input := catalog.Input{Kind: kind, Value: value, Label: strings.TrimSpace(value), Source: "manual"}
	return s.saveEntry(ctx, input, *selected)
}
func (s *Service) saveEntry(ctx context.Context, input catalog.Input, entry catalog.Entry) (Result, error) {
	err := s.store.Update(ctx, func(doc *config.Document) error {
		for _, existing := range doc.Associations {
			if existing.SelectedID == entry.ID && existing.Input.Kind == input.Kind && strings.EqualFold(strings.TrimSpace(existing.Input.Value), strings.TrimSpace(input.Value)) {
				return nil
			}
		}
		doc.Associations = append(doc.Associations, config.ManualAssociation{Input: input, SelectedID: entry.ID})
		return nil
	})
	if err != nil {
		return Result{}, err
	}
	if s.changed != nil {
		s.changed()
	}
	return Result{Saved: true, Entry: &entry}, nil
}
func (s *Service) IdentifyFile(ctx context.Context) (Resolution, error) {
	if !s.pickerMu.TryLock() {
		return Resolution{}, fmt.Errorf("已有选择器正在打开")
	}
	defer s.pickerMu.Unlock()
	path, err := s.picker.PickFile(ctx)
	if err != nil {
		return Resolution{}, err
	}
	if path == "" {
		return Resolution{Entries: []catalog.Entry{}, Cancelled: true}, nil
	}
	typ, err := s.system.IdentifyFile(ctx, path)
	if err != nil {
		return Resolution{}, err
	}
	entries, err := s.catalog.Resolve(ctx, []catalog.Input{{Kind: "identifier", Value: typ.Identifier, Label: typ.Name, Source: "manual", Origin: "file"}})
	return Resolution{Entries: entries, FileName: path}, err
}

// AddIdentifiedType resolves the identifier again; callers cannot persist fabricated entries.
func (s *Service) AddIdentifiedType(ctx context.Context, identifier string) (Result, error) {
	input := catalog.Input{Kind: "identifier", Value: identifier, Label: identifier, Source: "manual", Origin: "file"}
	entries, err := s.catalog.Resolve(ctx, []catalog.Input{input})
	if err != nil {
		return Result{}, err
	}
	for _, entry := range entries {
		if entry.Resolved && entry.Association.Key == identifier {
			return s.saveEntry(ctx, input, entry)
		}
	}
	return Result{}, fmt.Errorf("文件类型仍未解析，不能添加")
}
func (s *Service) PickApplication(ctx context.Context) (Result, error) {
	if !s.pickerMu.TryLock() {
		return Result{}, fmt.Errorf("已有选择器正在打开")
	}
	defer s.pickerMu.Unlock()
	path, err := s.picker.PickApplication(ctx)
	if err != nil {
		return Result{}, err
	}
	if path == "" {
		return Result{Cancelled: true}, nil
	}
	if !strings.EqualFold(filepath.Ext(path), ".app") {
		return Result{}, fmt.Errorf("请选择 .app 应用包")
	}
	bundle, err := s.system.ReadApplication(ctx, path)
	if err != nil {
		return Result{}, err
	}
	if bundle.App.Path == "" || !strings.EqualFold(filepath.Ext(bundle.App.Path), ".app") || bundle.App.MetadataError != "" {
		return Result{}, fmt.Errorf("所选应用不可用：%s", bundle.App.MetadataError)
	}
	err = s.store.Update(ctx, func(doc *config.Document) error {
		for i, existing := range doc.Applications {
			if existing.Path == bundle.App.Path {
				doc.Applications[i] = bundle.App
				return nil
			}
		}
		doc.Applications = append(doc.Applications, bundle.App)
		return nil
	})
	if err != nil {
		return Result{}, err
	}
	if s.changed != nil {
		s.changed()
	}
	return Result{Saved: true, App: &bundle.App}, nil
}
