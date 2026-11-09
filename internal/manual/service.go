// Package manual owns explicit additions. Picker selection never changes a default.
package manual

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/config"
	"github.com/sunven/default-apps/internal/discovery"
	"github.com/sunven/default-apps/internal/manualassociations"
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
	catalog      *catalog.Service
	associations *manualassociations.Collection
	system       SystemAdapter
	store        config.Repository
	picker       Picker
	changed      func()
	pickerMu     sync.Mutex
}

func NewService(catalogService *catalog.Service, system SystemAdapter, store config.Repository, picker Picker, changed func()) *Service {
	return &Service{catalog: catalogService, associations: manualassociations.New(catalogService, store), system: system, store: store, picker: picker, changed: changed}
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
	if kind != "extension" && kind != "scheme" {
		return Result{}, fmt.Errorf("请选择扩展名或 URL 协议")
	}
	return s.saveChoice(ctx, manualassociations.Choice{Kind: kind, Value: value, SelectedID: selectedID})
}
func (s *Service) saveChoice(ctx context.Context, choice manualassociations.Choice) (Result, error) {
	entry, err := s.associations.Save(ctx, choice)
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
	return s.saveChoice(ctx, manualassociations.Choice{Kind: "identifier", Value: identifier})
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
	if !association.IsApplicationBundlePath(path) {
		return Result{}, fmt.Errorf("请选择 .app 应用包")
	}
	bundle, err := s.system.ReadApplication(ctx, path)
	if err != nil {
		return Result{}, err
	}
	if !bundle.App.Usable() || !association.IsApplicationBundlePath(bundle.App.Path) {
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
