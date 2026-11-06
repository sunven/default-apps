package change

type QuitState struct {
	PromptID uint64 `json:"promptID"`
	Prompt   bool   `json:"prompt"`
	Exiting  bool   `json:"exiting"`
}

// RequestQuit is the shared native ShouldQuit / WindowClosing guard. It never
// loads storage, queries the system, waits for completion, or waits for the UI.
func (s *Service) RequestQuit() bool {
	s.mu.Lock()
	if s.state.Quit.Exiting {
		s.mu.Unlock()
		return true
	}
	if s.state.Quit.Prompt {
		s.mu.Unlock()
		return false
	}
	if !s.state.Busy && s.admitting == nil && s.state.Recovery == nil {
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
	s.state.Quit.Exiting = exit
	v := s.changedLocked()
	s.mu.Unlock()
	if exit {
		if s.options.Quit != nil {
			go s.options.Quit()
		}
	} else {
		s.publish(v)
	}
	return v
}
