// Package discovery scans application locations without inferring system defaults.
package discovery

import (
	"context"
	"encoding/json"
	"io/fs"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/config"
	"github.com/sunven/default-apps/internal/manualassociations"
)

type Issue struct {
	Path    string `json:"path"`
	Origin  string `json:"origin"`
	Message string `json:"message"`
}
type Bundle struct {
	App    association.AppCopy `json:"app"`
	Info   map[string]any      `json:"info"`
	Issues []Issue             `json:"issues"`
}
type Application struct {
	Manual         bool                `json:"manual,omitempty"`
	Unavailable    bool                `json:"unavailable,omitempty"`
	App            association.AppCopy `json:"app"`
	AssociationIDs []string            `json:"associationIDs"`
	Issues         []Issue             `json:"issues"`
	Declarations   []Declaration       `json:"declarations"`
	Definitions    []TypeDefinition    `json:"definitions"`
}
type Snapshot struct {
	Version     uint64          `json:"version"`
	Scanning    bool            `json:"scanning"`
	Apps        []Application   `json:"apps"`
	Entries     []catalog.Entry `json:"entries"`
	Reparses    []ReparseResult `json:"reparses,omitempty"`
	Issues      []Issue         `json:"issues"`
	Roots       []string        `json:"roots"`
	StartedAt   string          `json:"startedAt"`
	CompletedAt string          `json:"completedAt"`
	DurationMS  int64           `json:"durationMS"`
}
type SystemAdapter interface {
	ReadApplication(context.Context, string) (Bundle, error)
}
type Service struct {
	mu           sync.Mutex
	system       SystemAdapter
	catalog      *catalog.Service
	roots        []string
	state        Snapshot
	changed      func(Snapshot)
	associations *manualassociations.Collection
	rescan       bool
	reparses     []reparseRequest
}

func NewService(system SystemAdapter, catalogService *catalog.Service, roots []string, changed func(Snapshot), store config.Repository) *Service {
	service := &Service{system: system, catalog: catalogService, roots: append([]string{}, roots...), changed: changed, state: Snapshot{Apps: []Application{}, Entries: []catalog.Entry{}, Issues: []Issue{}, Roots: append([]string{}, roots...)}}
	if store != nil {
		service.associations = manualassociations.New(catalogService, store)
	}
	return service
}
func (s *Service) GetSnapshot() Snapshot { s.mu.Lock(); defer s.mu.Unlock(); return clone(s.state) }

// StartScan accepts immediately; its lifetime is independent of the bridge call.
func (s *Service) StartScan() Snapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.startScanLocked()
}

func (s *Service) startScanLocked() Snapshot {
	if s.state.Scanning {
		s.rescan = true
		return clone(s.state)
	}
	s.rescan = false
	s.state.Scanning = true
	s.state.Reparses = nil
	s.state.Version++
	s.state.StartedAt = time.Now().UTC().Format(time.RFC3339Nano)
	result := clone(s.state)
	reparses := s.reparses
	s.reparses = nil
	go s.scan(s.state.StartedAt, reparses)
	return result
}
func (s *Service) publish(state Snapshot) {
	// Detach from the scan worker's mutable graph before it appends or sorts.
	// The stored snapshot only changes scalar fields in place, so the event can
	// share its immutable slices.
	snapshot := clone(state)
	s.mu.Lock()
	snapshot.Version = s.state.Version + 1
	s.state = snapshot
	s.mu.Unlock()
	if s.changed != nil {
		s.changed(snapshot)
	}
}
func clone(value Snapshot) Snapshot {
	data, _ := json.Marshal(value)
	var result Snapshot
	_ = json.Unmarshal(data, &result)
	return result
}
func (s *Service) scan(startedAt string, reparses []reparseRequest) {
	start := time.Now()
	ctx := context.Background()
	state := Snapshot{Scanning: true, StartedAt: startedAt, Roots: append([]string{}, s.roots...), Apps: []Application{}, Entries: []catalog.Entry{}, Issues: []Issue{}}
	entries, err := s.catalog.List(ctx)
	if err != nil {
		state.Issues = append(state.Issues, Issue{Origin: "common", Message: err.Error()})
	} else {
		state.Entries = entries
	}
	s.publish(state)
	seen := map[string]bool{}
	for _, root := range s.roots {
		_ = filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				state.Issues = append(state.Issues, Issue{Path: path, Origin: "scan", Message: walkErr.Error()})
				return nil
			}
			if !association.IsApplicationBundlePath(entry.Name()) {
				return nil
			}
			bundle, readErr := s.system.ReadApplication(ctx, path)
			if readErr != nil {
				state.Issues = append(state.Issues, Issue{Path: path, Origin: "bundle", Message: readErr.Error()})
			} else if bundle.App.Path == "" {
				state.Issues = append(state.Issues, Issue{Path: path, Origin: "bundle", Message: "应用包缺少可确认的规范路径"})
			} else if !seen[bundle.App.Path] {
				seen[bundle.App.Path] = true
				app, entries := s.describe(ctx, bundle)
				state.Entries = catalog.Merge(state.Entries, entries)
				state.Apps = append(state.Apps, app)
				if len(state.Apps)%10 == 0 {
					s.publish(state)
				}
				state.Issues = append(state.Issues, app.Issues...)
			}
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		})
	}
	if s.associations != nil {
		restored, loadErr := s.associations.Restore(ctx)
		if loadErr != nil {
			state.Issues = append(state.Issues, Issue{Origin: "configuration", Message: loadErr.Error()})
		} else {
			state.Entries = catalog.Merge(state.Entries, restored.Entries)
			for _, problem := range restored.Problems {
				state.Issues = append(state.Issues, Issue{Origin: "manual", Message: problem.Error()})
			}
			for _, saved := range restored.Applications {
				if seen[saved.Path] {
					for i := range state.Apps {
						if state.Apps[i].App.Path == saved.Path {
							state.Apps[i].Manual = true
							if state.Apps[i].App.MetadataError != "" {
								state.Apps[i].Unavailable = true
								state.Apps[i].AssociationIDs = []string{}
								state.Apps[i].Declarations = []Declaration{}
								state.Apps[i].Definitions = []TypeDefinition{}
							}
						}
					}
					continue
				}
				bundle, readErr := s.system.ReadApplication(ctx, saved.Path)
				if readErr != nil || bundle.App.Path != saved.Path || !bundle.App.Usable() {
					message := "原位置已指向另一应用副本，请重新选择"
					if bundle.App.MetadataError != "" {
						message = bundle.App.MetadataError
					}
					if readErr != nil {
						message = readErr.Error()
					}
					saved.MetadataError = message
					issue := Issue{Path: saved.Path, Origin: "manual", Message: message}
					state.Apps = append(state.Apps, Application{App: saved, Manual: true, Unavailable: true, AssociationIDs: []string{}, Declarations: []Declaration{}, Definitions: []TypeDefinition{}, Issues: []Issue{issue}})
					state.Issues = append(state.Issues, issue)
				} else {
					app, entries := s.describe(ctx, bundle)
					app.Manual = true
					state.Apps = append(state.Apps, app)
					state.Entries = catalog.Merge(state.Entries, entries)
					state.Issues = append(state.Issues, app.Issues...)
				}
				seen[saved.Path] = true
			}
		}
	}
	sort.SliceStable(state.Apps, func(i, j int) bool {
		a, b := state.Apps[i].App, state.Apps[j].App
		if a.Name == b.Name {
			return a.Path < b.Path
		}
		return strings.ToLower(a.Name) < strings.ToLower(b.Name)
	})
	state.Scanning = false
	state.CompletedAt = time.Now().UTC().Format(time.RFC3339Nano)
	state.DurationMS = time.Since(start).Milliseconds()
	for _, request := range reparses {
		state.Reparses = append(state.Reparses, matchReparse(request, state.Entries))
	}
	s.publish(state)
	s.mu.Lock()
	if s.rescan && !s.state.Scanning {
		s.startScanLocked()
	}
	s.mu.Unlock()
}

func (s *Service) describe(ctx context.Context, bundle Bundle) (Application, []catalog.Entry) {
	app := Application{App: bundle.App, AssociationIDs: []string{}, Issues: append([]Issue{}, bundle.Issues...)}
	decls, definitions, problems := declarations(bundle)
	app.Declarations = decls
	app.Definitions = definitions
	app.Issues = append(app.Issues, problems...)
	inputs := []catalog.Input{}
	for _, declaration := range decls {
		if declaration.Handling {
			inputs = append(inputs, declaration.Inputs...)
		}
	}
	entries, err := s.catalog.Resolve(ctx, inputs)
	if err != nil {
		app.Issues = append(app.Issues, Issue{Path: bundle.App.Path, Origin: "resolve", Message: err.Error()})
	}
	for _, entry := range entries {
		app.AssociationIDs = append(app.AssociationIDs, entry.ID)
	}
	return app, entries
}
