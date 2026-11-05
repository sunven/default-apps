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
	mu      sync.Mutex
	system  SystemAdapter
	catalog *catalog.Service
	roots   []string
	state   Snapshot
	changed func(Snapshot)
}

func NewService(system SystemAdapter, catalogService *catalog.Service, roots []string, changed func(Snapshot)) *Service {
	return &Service{system: system, catalog: catalogService, roots: append([]string{}, roots...), changed: changed, state: Snapshot{Apps: []Application{}, Entries: []catalog.Entry{}, Issues: []Issue{}, Roots: append([]string{}, roots...)}}
}
func (s *Service) GetSnapshot() Snapshot { s.mu.Lock(); defer s.mu.Unlock(); return clone(s.state) }

// StartScan accepts immediately; its lifetime is independent of the bridge call.
func (s *Service) StartScan() Snapshot {
	s.mu.Lock()
	if s.state.Scanning {
		result := clone(s.state)
		s.mu.Unlock()
		return result
	}
	s.state.Scanning = true
	s.state.Version++
	s.state.StartedAt = time.Now().UTC().Format(time.RFC3339Nano)
	result := clone(s.state)
	s.mu.Unlock()
	go s.scan()
	return result
}
func (s *Service) publish(state Snapshot) {
	s.mu.Lock()
	state.Version = s.state.Version + 1
	s.state = clone(state)
	s.mu.Unlock()
	if s.changed != nil {
		// Event delivery can serialize after this worker resumes. Give it its own
		// immutable graph before append/sort changes any backing arrays.
		s.changed(clone(state))
	}
}
func clone(value Snapshot) Snapshot {
	data, _ := json.Marshal(value)
	var result Snapshot
	_ = json.Unmarshal(data, &result)
	return result
}
func (s *Service) scan() {
	start := time.Now()
	ctx := context.Background()
	state := Snapshot{Scanning: true, StartedAt: s.GetSnapshot().StartedAt, Roots: append([]string{}, s.roots...), Apps: []Application{}, Entries: []catalog.Entry{}, Issues: []Issue{}}
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
			if !strings.EqualFold(filepath.Ext(entry.Name()), ".app") {
				return nil
			}
			bundle, readErr := s.system.ReadApplication(ctx, path)
			if readErr != nil {
				state.Issues = append(state.Issues, Issue{Path: path, Origin: "bundle", Message: readErr.Error()})
			} else if bundle.App.Path == "" {
				state.Issues = append(state.Issues, Issue{Path: path, Origin: "bundle", Message: "应用包缺少可确认的规范路径"})
			} else if !seen[bundle.App.Path] {
				seen[bundle.App.Path] = true
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
				entries, resolveErr := s.catalog.Resolve(ctx, inputs)
				if resolveErr != nil {
					app.Issues = append(app.Issues, Issue{Path: bundle.App.Path, Origin: "resolve", Message: resolveErr.Error()})
				}
				for _, entry := range entries {
					app.AssociationIDs = append(app.AssociationIDs, entry.ID)
				}
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
	s.publish(state)
}
