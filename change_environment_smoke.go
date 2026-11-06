//go:build change_smoke

package main

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sync"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/change"
	"github.com/sunven/default-apps/internal/config"
	"github.com/sunven/default-apps/internal/discovery"
	"github.com/sunven/default-apps/internal/native"
)

// This adapter is linked only into explicitly tagged acceptance builds. It never
// invokes a native setter. The loopback control plane is not a product service.
type smokeSystem struct {
	mu                                             sync.Mutex
	current                                        *association.AppCopy
	target                                         association.AppCopy
	queryError, unavailable, saveError, clearError bool
	starts                                         int
	actualStarts                                   int
	initiated                                      bool
	submitted                                      func()
	complete                                       func(*change.NativeError)
	pendingAtDispatch                              config.Document
	store                                          *config.Store
	querySequence                                  int
	queryCalls                                     []association.Association
	holdAssociation                                *association.Association
	heldQueries                                    map[int]chan struct{}
	holdSave                                       bool
	saving                                         bool
	saveRelease                                    chan struct{}
}

func changeEnvironment(_ string) (*config.Store, association.SystemAdapter, change.ApplicationReader, change.Dispatcher, []string) {
	root := os.Getenv("DEFAULT_APPS_CHANGE_SMOKE_ROOT")
	if root == "" {
		panic("change_smoke requires DEFAULT_APPS_CHANGE_SMOKE_ROOT")
	}
	if err := os.MkdirAll(root, 0700); err != nil {
		panic(err)
	}
	sys := &smokeSystem{current: &association.AppCopy{Path: "/Controlled/Before.app", DisplayPath: "/Controlled/Before.app", Name: "Before", Version: "1", BundleID: "controlled.before"}, target: association.AppCopy{Path: "/Applications/Xcode.app", DisplayPath: "/Applications/Xcode.app", Name: "Xcode", Version: "27.2", BundleID: "com.apple.dt.Xcode"}}
	store := config.NewStoreWithWriter(filepath.Join(root, "config.json"), func(path string, data []byte) error {
		var doc config.Document
		_ = json.Unmarshal(data, &doc)
		sys.mu.Lock()
		fail := (sys.saveError && len(doc.Pending) > 0) || (sys.clearError && len(doc.Pending) == 0)
		hold := sys.holdSave && len(doc.Pending) > 0
		var release chan struct{}
		if hold {
			sys.holdSave = false
			sys.saving = true
			sys.saveRelease = make(chan struct{})
			release = sys.saveRelease
		}
		sys.mu.Unlock()
		if hold {
			<-release
			sys.mu.Lock()
			sys.saving = false
			sys.mu.Unlock()
		}
		if fail {
			return errors.New("controlled storage denied")
		}
		return config.AtomicWrite(path, data)
	})
	sys.store = store
	if path := os.Getenv("DEFAULT_APPS_CHANGE_SMOKE_CURRENT"); path != "" {
		copy := sys.target
		copy.Path = path
		copy.DisplayPath = path
		sys.current = &copy
	}
	sys.queryError = os.Getenv("DEFAULT_APPS_CHANGE_SMOKE_QUERY_ERROR") == "1"
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		panic(err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/control", sys.control)
	_ = os.WriteFile(filepath.Join(root, "control-address"), []byte("http://"+listener.Addr().String()), 0600)
	go func() { _ = http.Serve(listener, mux) }()
	return store, sys, sys, sys, []string{"file", "scheme"}
}
func (s *smokeSystem) CurrentDefault(_ context.Context, a association.Association) (*association.AppCopy, error) {
	s.mu.Lock()
	s.querySequence++
	sequence := s.querySequence
	s.queryCalls = append(s.queryCalls, a)
	var release chan struct{}
	if s.holdAssociation != nil && *s.holdAssociation == a {
		s.holdAssociation = nil
		release = make(chan struct{})
		if s.heldQueries == nil {
			s.heldQueries = make(map[int]chan struct{})
		}
		s.heldQueries[sequence] = release
	}
	queryError := s.queryError
	var value *association.AppCopy
	if s.current != nil {
		copy := *s.current
		value = &copy
	}
	s.mu.Unlock()
	if release != nil {
		<-release
	}
	if queryError {
		return nil, errors.New("controlled readback unavailable")
	}
	return value, nil
}
func (s *smokeSystem) CandidateApplications(context.Context, association.Association) ([]association.AppCopy, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	other := s.target
	other.Path = "/Controlled/Other/Xcode.app"
	other.DisplayPath = other.Path
	return []association.AppCopy{s.target, other}, nil
}
func (s *smokeSystem) ReadApplication(ctx context.Context, path string) (discovery.Bundle, error) {
	s.mu.Lock()
	missing := s.unavailable
	s.mu.Unlock()
	if missing {
		return discovery.Bundle{}, errors.New("controlled target unavailable")
	}
	if path == "/Controlled/Other/Xcode.app" {
		s.mu.Lock()
		v := s.target
		s.mu.Unlock()
		v.Path = path
		v.DisplayPath = path
		return discovery.Bundle{App: v}, nil
	}
	return native.Adapter{}.ReadApplication(ctx, path)
}
func (s *smokeSystem) Dispatch(_ association.Association, _ association.AppCopy, submitted func(), complete func(*change.NativeError)) {
	doc, _ := s.store.Load(context.Background())
	s.mu.Lock()
	s.starts++
	s.initiated = false
	s.submitted = submitted
	s.complete = complete
	s.pendingAtDispatch = doc
	s.mu.Unlock()
}
func (s *smokeSystem) control(w http.ResponseWriter, r *http.Request) {
	var command struct {
		Action          string                   `json:"action"`
		Path            *string                  `json:"path"`
		QueryError      *bool                    `json:"queryError"`
		Unavailable     *bool                    `json:"unavailable"`
		SaveError       *bool                    `json:"saveError"`
		ClearError      *bool                    `json:"clearError"`
		Error           *change.NativeError      `json:"error"`
		HoldAssociation *association.Association `json:"holdAssociation"`
		ReleaseQuery    int                      `json:"releaseQuery"`
		HoldSave        *bool                    `json:"holdSave"`
	}
	if r.Method == http.MethodPost {
		if err := json.NewDecoder(r.Body).Decode(&command); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
	}
	s.mu.Lock()
	if command.Path != nil {
		if *command.Path == "" {
			s.current = nil
		} else {
			v := s.target
			v.Path = *command.Path
			v.DisplayPath = v.Path
			s.current = &v
		}
	}
	if command.QueryError != nil {
		s.queryError = *command.QueryError
	}
	if command.Unavailable != nil {
		s.unavailable = *command.Unavailable
	}
	if command.SaveError != nil {
		s.saveError = *command.SaveError
	}
	if command.ClearError != nil {
		s.clearError = *command.ClearError
	}
	if command.HoldAssociation != nil {
		s.holdAssociation = command.HoldAssociation
	}
	if release := s.heldQueries[command.ReleaseQuery]; release != nil {
		close(release)
		delete(s.heldQueries, command.ReleaseQuery)
	}
	if command.HoldSave != nil {
		s.holdSave = *command.HoldSave
	}
	if command.Action == "release-save" && s.saveRelease != nil {
		close(s.saveRelease)
		s.saveRelease = nil
	}
	held := []int{}
	for id := range s.heldQueries {
		held = append(held, id)
	}
	submitted, complete := s.submitted, s.complete
	result := map[string]any{"layer": "native Wails shell + controlled adapter", "starts": s.starts, "actualStarts": s.actualStarts, "current": s.current, "pendingAtDispatch": s.pendingAtDispatch, "queries": s.queryCalls, "querySequence": s.querySequence, "heldQueries": held, "saving": s.saving}
	s.mu.Unlock()
	if command.Action == "submitted" && submitted != nil {
		s.mu.Lock()
		if !s.initiated {
			s.actualStarts++
			s.initiated = true
		}
		s.mu.Unlock()
		submitted()
	}
	if command.Action == "complete" && complete != nil {
		complete(command.Error)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}
