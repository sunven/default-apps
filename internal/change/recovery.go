package change

import "github.com/sunven/default-apps/internal/association"

// Recovery is an old process's durable uncertainty, never an active callback.
type Recovery struct {
	Record PendingRecord `json:"record"`
	Ready  bool          `json:"ready"`
}

func (s *Service) observeRecoveryLocked(result association.QueryResult) {
	recovery := s.state.Recovery
	if recovery == nil || recovery.Record.Association != result.Association {
		return
	}
	recovery.Ready = result.Default.Trustworthy()
	if s.admitting == nil && s.state.ActiveRequestID == "" {
		s.state.Busy = !recovery.Ready
	}
}

// A failed save can leave new evidence on disk, including after a stopped batch
// clears its error message. Re-read while idle, without downgrading live results
// or replaying a setter. Existing recovery readiness survives a read of the
// same identity; a different durable identity needs its own query and consent.
func (s *Service) refreshRecovery() error {
	s.batchMu.Lock()
	defer s.batchMu.Unlock()
	s.mu.Lock()
	needed, version := s.canRefreshRecoveryLocked(), s.state.Version
	s.mu.Unlock()
	if !needed {
		return nil
	}
	recovered, err := s.records.load()
	if err != nil {
		return err
	}
	if recovered.request == nil {
		return nil
	}
	req := recovered.request
	s.mu.Lock()
	if !s.canRefreshRecoveryLocked() || s.state.Version != version {
		s.mu.Unlock()
		return nil
	}
	if r := s.findRequestLocked(req.RequestID); r != nil && r.Phase == "resolved" {
		s.mu.Unlock()
		return nil
	}
	if s.state.Recovery != nil && s.state.Recovery.Record.RequestID == req.RequestID {
		s.mu.Unlock()
		return nil
	}
	if s.findRequestLocked(req.RequestID) == nil {
		s.state.Requests = append(s.state.Requests, *req)
	}
	s.state.Recovery = &Recovery{Record: req.PendingRecord}
	s.state.Busy = true
	v := s.changedLocked()
	s.mu.Unlock()
	s.publish(v)
	return nil
}

func (s *Service) canRefreshRecoveryLocked() bool {
	return s.admitting == nil && s.state.ActiveRequestID == "" && !s.state.Quit.Exiting && !s.state.Quit.Restarting && (!s.state.Busy || s.state.Recovery != nil)
}

func (s *Service) resolvedRequestIDs() map[string]bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	ids := map[string]bool{}
	for _, req := range s.state.Requests {
		if req.Phase == "resolved" {
			ids[req.RequestID] = true
		}
	}
	return ids
}

func (s *Service) recordEvidence(recoveryID string) recordEvidence {
	return recordEvidence{
		resolved: s.resolvedRequestIDs(),
		acknowledged: func(id string) bool {
			s.mu.Lock()
			defer s.mu.Unlock()
			recovery := s.state.Recovery
			return recovery != nil && recovery.Ready && recovery.Record.RequestID == id && recoveryID == id
		},
	}
}
