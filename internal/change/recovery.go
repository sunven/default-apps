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
