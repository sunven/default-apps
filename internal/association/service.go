// Package association owns observations of system defaults and candidates.
package association

import (
	"context"
	"sync"
	"time"
)

type Association struct {
	Kind string `json:"kind"`
	Key  string `json:"key"`
}

type AppCopy struct {
	Path          string `json:"path"`
	DisplayPath   string `json:"displayPath"`
	Name          string `json:"name"`
	Version       string `json:"version"`
	BundleID      string `json:"bundleID"`
	MetadataError string `json:"metadataError,omitempty"`
}

type QueryError struct {
	Message string `json:"message"`
}

type DefaultObservation struct {
	Known      bool        `json:"known"`
	App        *AppCopy    `json:"app"`
	ObservedAt string      `json:"observedAt"`
	Error      *QueryError `json:"error"`
	Stale      bool        `json:"stale"`
}

type CandidateObservation struct {
	Known      bool        `json:"known"`
	Apps       []AppCopy   `json:"apps"`
	ObservedAt string      `json:"observedAt"`
	Error      *QueryError `json:"error"`
	Stale      bool        `json:"stale"`
}

type QueryResult struct {
	Association Association          `json:"association"`
	Default     DefaultObservation   `json:"default"`
	Candidates  CandidateObservation `json:"candidates"`
	Version     uint64               `json:"version"`
}

// SystemAdapter returns Go-owned data. Path is the canonical bundle identity;
// DisplayPath preserves the system's display location. The two queries are independent.
type SystemAdapter interface {
	CurrentDefault(context.Context, Association) (*AppCopy, error)
	CandidateApplications(context.Context, Association) ([]AppCopy, error)
}

type queryEntry struct {
	mu     sync.Mutex
	result QueryResult
}

type Service struct {
	system  SystemAdapter
	mu      sync.Mutex
	entries map[Association]*queryEntry
}

func NewService(system SystemAdapter) *Service {
	return &Service{system: system, entries: make(map[Association]*queryEntry)}
}

func (s *Service) Query(ctx context.Context, a Association) (QueryResult, error) {
	s.mu.Lock()
	entry := s.entries[a]
	if entry == nil {
		entry = &queryEntry{result: QueryResult{Association: a, Candidates: CandidateObservation{Apps: []AppCopy{}}}}
		s.entries[a] = entry
	}
	s.mu.Unlock()
	// Serialize observations for one association; unrelated associations remain independent.
	entry.mu.Lock()
	defer entry.mu.Unlock()
	current, currentErr := s.system.CurrentDefault(ctx, a)
	candidates, candidatesErr := s.system.CandidateApplications(ctx, a)
	result := entry.result
	result.Version++
	if currentErr == nil {
		result.Default = DefaultObservation{Known: true, App: copyApp(current), ObservedAt: time.Now().UTC().Format(time.RFC3339Nano)}
	} else {
		result.Default.Error = &QueryError{Message: currentErr.Error()}
		result.Default.Stale = result.Default.Known
	}
	if candidatesErr == nil {
		if candidates == nil {
			candidates = []AppCopy{}
		}
		result.Candidates = CandidateObservation{Known: true, Apps: uniqueCopies(candidates), ObservedAt: time.Now().UTC().Format(time.RFC3339Nano)}
	} else {
		result.Candidates.Error = &QueryError{Message: candidatesErr.Error()}
		result.Candidates.Stale = result.Candidates.Known
	}
	entry.result = result
	return copyResult(result), nil
}

func uniqueCopies(apps []AppCopy) []AppCopy {
	result := make([]AppCopy, 0, len(apps))
	seen := make(map[string]bool, len(apps))
	for _, app := range apps {
		if !seen[app.Path] {
			seen[app.Path] = true
			result = append(result, app)
		}
	}
	return result
}

func copyApp(app *AppCopy) *AppCopy {
	if app == nil {
		return nil
	}
	copy := *app
	return &copy
}

func copyResult(result QueryResult) QueryResult {
	result.Default.App = copyApp(result.Default.App)
	result.Candidates.Apps = append([]AppCopy{}, result.Candidates.Apps...)
	if result.Default.Error != nil {
		value := *result.Default.Error
		result.Default.Error = &value
	}
	if result.Candidates.Error != nil {
		value := *result.Candidates.Error
		result.Candidates.Error = &value
	}
	return result
}
