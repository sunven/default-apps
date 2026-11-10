package change

import "errors"

type QuitState struct {
	PromptID   uint64 `json:"promptID"`
	Prompt     bool   `json:"prompt"`
	Exiting    bool   `json:"exiting"`
	Intent     string `json:"intent,omitempty"`
	Restarting bool   `json:"restarting,omitempty"`
}

// RequestQuit is the shared native ShouldQuit / WindowClosing guard. It never
// loads storage, queries the system, waits for completion, or waits for the UI.
func (s *Service) RequestQuit() bool {
	s.mu.Lock()
	if s.state.Quit.Exiting {
		s.mu.Unlock()
		return true
	}
	if s.state.Quit.Restarting {
		s.mu.Unlock()
		return false
	}
	if s.state.Quit.Prompt {
		s.mu.Unlock()
		return false
	}
	if !s.state.Busy && s.admitting == nil && s.state.Recovery == nil && !s.batchBlocksLocked() {
		s.state.Quit.Exiting = true
		s.state.Version++
		s.mu.Unlock()
		return true
	}
	if !s.state.Quit.Prompt {
		s.state.Quit.Prompt = true
		s.state.Quit.PromptID++
		v := s.changedLocked()
		s.mu.Unlock()
		go s.publish(v)
		return false
	}
	s.mu.Unlock()
	return false
}

// RespondQuit accepts only the currently displayed prompt. Closing or Escape is
// the same as staying. A deliberate exit closes admission before calling Quit.
func (s *Service) RespondQuit(promptID uint64, exit bool) Snapshot {
	s.mu.Lock()
	if !s.state.Quit.Prompt || s.state.Quit.PromptID != promptID || s.state.Quit.Exiting {
		v := clone(s.state)
		s.mu.Unlock()
		return v
	}
	s.state.Quit.Prompt = false
	updating := s.state.Quit.Intent == "update"
	action := s.restart
	if updating {
		s.state.Quit.Restarting = exit
		if !exit {
			s.state.Quit.Intent = ""
			s.restart = nil
		}
	} else {
		s.state.Quit.Exiting = exit
	}
	v := s.changedLocked()
	s.mu.Unlock()
	if updating {
		s.publish(v)
		if exit && action != nil {
			go action()
		} else if !exit {
			s.kickBatch()
		}
	} else if exit {
		if s.options.Quit != nil {
			go s.options.Quit()
		}
	} else {
		s.publish(v)
		s.kickBatch()
	}
	return v
}

// PrepareRestart coordinates the user's update choice before a helper exists.
// Keep completions alive until the helper is ready; only new admission is shut.
// A free function deliberately keeps this callback surface out of Wails bindings.
func PrepareRestart(s *Service, action func()) error {
	if action == nil {
		return errors.New("重启操作不可用。")
	}
	if err := s.ensureLoaded(); err != nil {
		return err
	}
	s.mu.Lock()
	if s.state.Quit.Exiting || s.state.Quit.Restarting || s.state.Quit.Prompt {
		s.mu.Unlock()
		return errors.New("请先完成当前退出选择。")
	}
	s.restart = action
	s.state.Quit.Intent = "update"
	prompt := s.state.Busy || s.admitting != nil || s.state.Recovery != nil || s.batchBlocksLocked()
	s.state.Quit.Prompt = prompt
	s.state.Quit.Restarting = !prompt
	if prompt {
		s.state.Quit.PromptID++
	}
	v := s.changedLocked()
	s.mu.Unlock()
	s.publish(v)
	if !prompt {
		go action()
	}
	return nil
}

// CommitRestart is called exclusively by the updater host after helper readiness.
func CommitRestart(s *Service) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.state.Quit.Restarting || s.state.Quit.Exiting {
		return false
	}
	s.state.Quit.Exiting = true
	s.state.Version++
	return true
}

// CancelRestart reopens admission when helper startup failed, retaining results
// delivered while the helper was being prepared.
func CancelRestart(s *Service) {
	s.mu.Lock()
	if s.state.Quit.Intent != "update" || s.state.Quit.Exiting {
		s.mu.Unlock()
		return
	}
	s.state.Quit.Intent = ""
	s.state.Quit.Restarting = false
	s.state.Quit.Prompt = false
	s.restart = nil
	v := s.changedLocked()
	s.mu.Unlock()
	s.publish(v)
	s.kickBatch()
}
