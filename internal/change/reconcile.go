package change

// Reconciliation never starts a native request. Missing IDs are closed before
// returning, so an original binding call arriving late cannot subsequently write.
// The original parameters are retained to detect accidental ID reuse.
type Reconciliation struct {
	State    string        `json:"state"`
	Result   *SubmitResult `json:"result"`
	Snapshot Snapshot      `json:"snapshot"`
}
type admissionResult struct {
	input  Submission
	result SubmitResult
}

func (s *Service) decidedLocked(in Submission) *SubmitResult {
	previous, ok := s.decisions[in.RequestID]
	if !ok {
		return nil
	}
	if !sameSubmission(previous.input, in) {
		return &SubmitResult{Outcome: "conflict", Message: "请求标识已用于另一项修改。", Snapshot: clone(s.state)}
	}
	result := clone(previous.result)
	result.Snapshot = clone(s.state)
	return &result
}
func (s *Service) decideLocked(in Submission, result SubmitResult) {
	if s.decisions == nil {
		s.decisions = make(map[string]admissionResult)
	}
	// Replays attach the current snapshot in decidedLocked. Retaining this one
	// would duplicate the entire observation and icon cache for every decision.
	result.Snapshot = Snapshot{}
	s.decisions[in.RequestID] = admissionResult{input: in, result: clone(result)}
}
func (s *Service) ReconcileSubmission(in Submission) Reconciliation {
	_ = s.ensureLoaded()
	s.mu.Lock()
	defer s.mu.Unlock()
	snapshot := clone(s.state)
	if s.state.Quit.Exiting {
		return Reconciliation{State: "decided", Result: &SubmitResult{Outcome: "exiting", Message: "应用正在退出，不再受理新修改。", Snapshot: snapshot}, Snapshot: snapshot}
	}
	if previous := s.decidedLocked(in); previous != nil {
		return Reconciliation{State: "decided", Result: previous, Snapshot: snapshot}
	}
	if previous, ok := s.submissions[in.RequestID]; ok && !sameSubmission(previous, in) {
		return Reconciliation{State: "decided", Result: &SubmitResult{Outcome: "conflict", Message: "请求标识已用于另一项修改。", Snapshot: snapshot}, Snapshot: snapshot}
	}
	if request := s.findRequestLocked(in.RequestID); request != nil {
		if !in.matchesRecord(request.PendingRecord) {
			return Reconciliation{State: "decided", Result: &SubmitResult{Outcome: "conflict", Message: "请求标识已用于另一项修改。", Snapshot: snapshot}, Snapshot: snapshot}
		}
		return Reconciliation{State: "decided", Result: &SubmitResult{Outcome: "existing", Request: clone(request), Snapshot: snapshot}, Snapshot: snapshot}
	}
	if pending := s.admitting; pending != nil && pending.input.RequestID == in.RequestID {
		if !sameSubmission(pending.input, in) {
			return Reconciliation{State: "decided", Result: &SubmitResult{Outcome: "conflict", Message: "请求标识已用于另一项修改。", Snapshot: snapshot}, Snapshot: snapshot}
		}
		return Reconciliation{State: "pending", Snapshot: snapshot}
	}
	result := SubmitResult{Outcome: "interrupted", Message: "本次会话未受理原请求，迟到的提交不会执行。请查看当前默认后重新选择。", Snapshot: snapshot}
	if in.RequestID != "" {
		s.decideLocked(in, result)
	}
	return Reconciliation{State: "decided", Result: &result, Snapshot: snapshot}
}
