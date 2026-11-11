// Package change owns one process-wide change lifecycle, independent of callers.
package change

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/sunven/default-apps/internal/association"
	"github.com/sunven/default-apps/internal/catalog"
	"github.com/sunven/default-apps/internal/config"
)

type ExpectedDefault struct {
	Known bool   `json:"known"`
	Path  string `json:"path"`
}
type Submission struct {
	RequestID         string                  `json:"requestID"`
	Association       association.Association `json:"association"`
	TargetPath        string                  `json:"targetPath"`
	Expected          ExpectedDefault         `json:"expected"`
	RecoveryRequestID string                  `json:"recoveryRequestID"`
}
type NativeError struct {
	Domain      string `json:"domain"`
	Code        int64  `json:"code"`
	Description string `json:"description"`
}
type Completion struct {
	Known       bool         `json:"known"`
	Error       *NativeError `json:"error"`
	CompletedAt string       `json:"completedAt"`
}
type Readback struct {
	State       string                         `json:"state"`
	Observation association.DefaultObservation `json:"observation"`
}
type StorageIssue struct {
	Operation string `json:"operation"`
	Message   string `json:"message"`
}
type PendingRecord struct {
	RequestID   string                         `json:"requestID"`
	Association association.Association        `json:"association"`
	Target      association.AppCopy            `json:"target"`
	Preflight   association.DefaultObservation `json:"preflight"`
	Phase       string                         `json:"phase"`
	AcceptedAt  string                         `json:"acceptedAt"`
	SubmittedAt string                         `json:"submittedAt"`
}
type Request struct {
	PendingRecord
	BatchID      string        `json:"batchID,omitempty"`
	Completion   Completion    `json:"completion"`
	Readback     Readback      `json:"readback"`
	Confirmed    bool          `json:"confirmed"`
	StorageError *StorageIssue `json:"storageError"`
}
type Snapshot struct {
	Version         uint64                    `json:"version"`
	Busy            bool                      `json:"busy"`
	ActiveRequestID string                    `json:"activeRequestID"`
	Requests        []Request                 `json:"requests"`
	Observations    []association.QueryResult `json:"observations"`
	WritableKinds   []string                  `json:"writableKinds"`
	StorageError    *StorageIssue             `json:"storageError"`
	Recovery        *Recovery                 `json:"recovery"`
	Quit            QuitState                 `json:"quit"`
	Batch           *Batch                    `json:"batch,omitempty"`
	BatchBlocked    bool                      `json:"batchBlocked"`
}
type SubmitResult struct {
	Outcome     string                          `json:"outcome"`
	Message     string                          `json:"message"`
	Request     *Request                        `json:"request"`
	Snapshot    Snapshot                        `json:"snapshot"`
	Observation *association.DefaultObservation `json:"observation"`
}
type ApplicationReader interface {
	ReadApplicationCopy(context.Context, string) (association.AppCopy, error)
}

// Dispatcher starts a short asynchronous native initiation. It must call submitted
// when the native call actually runs and complete with copied error fields. Both
// callbacks may run inline or from any thread; neither owns the caller context.
type Dispatcher interface {
	Dispatch(association.Association, association.AppCopy, func(), func(*NativeError))
}

type DisabledDispatcher struct{}

func (DisabledDispatcher) Dispatch(_ association.Association, _ association.AppCopy, _ func(), complete func(*NativeError)) {
	if complete != nil {
		complete(&NativeError{Domain: "defaultapps", Code: 1, Description: "native write adapter unavailable"})
	}
}

type Options struct {
	WritableKinds      []string
	Publish            func(Snapshot)
	PublishObservation func(association.QueryResult)
	Quit               func()
}
type admission struct {
	input  Submission
	done   chan struct{}
	result SubmitResult
}

type Service struct {
	mu              sync.Mutex
	batchMu         sync.Mutex
	catalog         *catalog.Service
	queries         *association.Service
	reader          ApplicationReader
	store           config.Repository
	dispatcher      Dispatcher
	options         Options
	state           Snapshot
	submissions     map[string]Submission
	loadOnce        sync.Once
	loadError       error
	admitting       *admission
	decisions       map[string]admissionResult
	restart         func()
	previews        map[string]BatchPreview
	batchRecoveryID string
}

func NewService(c *catalog.Service, q *association.Service, r ApplicationReader, store config.Repository, d Dispatcher, options Options) *Service {
	return &Service{catalog: c, queries: q, reader: r, store: store, dispatcher: d, options: options, state: Snapshot{Requests: []Request{}, Observations: []association.QueryResult{}, WritableKinds: append([]string{}, options.WritableKinds...)}, submissions: map[string]Submission{}}
}
func now() string { return time.Now().UTC().Format(time.RFC3339Nano) }
func clone[T any](v T) T {
	data, _ := json.Marshal(v)
	var out T
	_ = json.Unmarshal(data, &out)
	return out
}
func (s *Service) changedLocked() Snapshot {
	s.state.BatchBlocked = s.batchBlocksLocked()
	s.state.Version++
	return clone(s.state)
}

// publish forwards a snapshot the caller has already detached from service
// state (changedLocked or clone); the receiver only serializes it.
func (s *Service) publish(v Snapshot) {
	s.mu.Lock()
	exiting := s.state.Quit.Exiting
	s.mu.Unlock()
	if exiting {
		return
	}
	if s.options.Publish != nil {
		s.options.Publish(v)
	}
}

func (s *Service) publishObservation(result association.QueryResult) {
	s.mu.Lock()
	exiting := s.state.Quit.Exiting
	s.mu.Unlock()
	if !exiting && s.options.PublishObservation != nil {
		s.options.PublishObservation(clone(result))
	}
}
func (s *Service) GetSnapshot() Snapshot {
	err := s.ensureLoaded()
	s.mu.Lock()
	defer s.mu.Unlock()
	if err != nil {
		s.state.StorageError = &StorageIssue{Operation: "load", Message: err.Error()}
	}
	s.state.BatchBlocked = s.batchBlocksLocked()
	return clone(s.state)
}

// Load old disk facts once without restoring a callback or replaying a setter.
func (s *Service) ensureLoaded() error {
	s.loadOnce.Do(func() {
		doc, err := s.store.Load(context.Background())
		if err != nil {
			s.loadError = err
			return
		}
		if err := s.loadBatch(doc); err != nil {
			s.loadError = err
			return
		}
		if len(doc.Pending) == 0 {
			return
		}
		var pending PendingRecord
		if err := json.Unmarshal(doc.Pending, &pending); err != nil {
			s.loadError = fmt.Errorf("待定修改记录损坏：%w", err)
			return
		}
		if pending.RequestID == "" || pending.Target.Path == "" || pending.Association.Key == "" {
			s.loadError = fmt.Errorf("待定修改记录缺少身份，已保留原文件。")
			return
		}
		pending.Phase = "recovered"
		s.mu.Lock()
		defer s.mu.Unlock()
		batchID := ""
		if s.state.Batch != nil {
			for _, item := range s.state.Batch.Items {
				if item.RequestID == pending.RequestID {
					batchID = s.state.Batch.ID
				}
			}
		}
		s.state.Requests = []Request{{PendingRecord: pending, BatchID: batchID, Readback: Readback{State: "unknown"}}}
		s.state.Recovery = &Recovery{Record: pending}
		s.state.Busy = true
		s.state.Version++
	})
	return s.loadError
}
func (s *Service) findRequestLocked(id string) *Request {
	for i := range s.state.Requests {
		if s.state.Requests[i].RequestID == id {
			return &s.state.Requests[i]
		}
	}
	return nil
}
func sameSubmission(a, b Submission) bool {
	return a.RequestID == b.RequestID && a.Association == b.Association && a.TargetPath == b.TargetPath && a.Expected == b.Expected && a.RecoveryRequestID == b.RecoveryRequestID
}

// matchesRecord compares the identity a submission claims with one persisted
// request. RecoveryRequestID is an acknowledgement, not part of that identity.
func (in Submission) matchesRecord(r PendingRecord) bool {
	return r.Association == in.Association && r.Target.Path == in.TargetPath &&
		r.Preflight.Known == in.Expected.Known && appPath(r.Preflight.App) == in.Expected.Path
}

// rejectLocked releases the lock and returns a rejection with the current snapshot.
func (s *Service) rejectLocked(outcome, message string) SubmitResult {
	v := clone(s.state)
	s.mu.Unlock()
	return SubmitResult{Outcome: outcome, Message: message, Snapshot: v}
}

// existingLocked releases the lock and returns the already-known request.
func (s *Service) existingLocked(request *Request) SubmitResult {
	v, r := clone(s.state), clone(request)
	s.mu.Unlock()
	return SubmitResult{Outcome: "existing", Request: r, Snapshot: v}
}

func (s *Service) Submit(ctx context.Context, in Submission) SubmitResult {
	return s.submit(ctx, in, "")
}

// batchID is supplied only by the backend coordinator, never by a binding caller.
func (s *Service) submit(ctx context.Context, in Submission, batchID string) SubmitResult {
	if in.RequestID == "" || in.Association.Kind == "" || in.Association.Key == "" || in.TargetPath == "" {
		return SubmitResult{Outcome: "invalid", Message: "提交缺少请求标识、关联身份或目标副本。"}
	}
	if err := s.ensureLoaded(); err != nil {
		return SubmitResult{Outcome: "storage_error", Message: err.Error()}
	}
	if !s.writable(in.Association.Kind) {
		return SubmitResult{Outcome: "unavailable", Message: "此版本尚未接入系统写入适配器。"}
	}
	s.mu.Lock()
	if batchID == "" && s.batchBlocksLocked() {
		return s.rejectLocked("busy", "批量设置尚未结束，请先停止后续设置。")
	}
	if batchID != "" && (s.state.Batch == nil || s.state.Batch.ID != batchID || s.state.Batch.State != "running") {
		return s.rejectLocked("batch_stopped", "批次已停止，不再提交下一项。")
	}
	if s.state.Quit.Exiting {
		return s.rejectLocked("exiting", "应用正在退出，不再受理新修改。")
	}
	if s.state.Quit.Restarting || (s.state.Quit.Prompt && s.state.Quit.Intent == "update") {
		return s.rejectLocked("busy", "正在确认重启安装，暂不受理新修改。")
	}
	if decided := s.decidedLocked(in); decided != nil {
		s.mu.Unlock()
		return *decided
	}
	if previous, ok := s.submissions[in.RequestID]; ok {
		if sameSubmission(previous, in) {
			return s.existingLocked(s.findRequestLocked(in.RequestID))
		}
		return s.rejectLocked("conflict", "请求标识已用于另一项修改。")
	}
	// Recovered IDs remain queryable but can never become a new native request,
	// including after a later explicit request replaces their durable record.
	if recovered := s.findRequestLocked(in.RequestID); recovered != nil {
		if !in.matchesRecord(recovered.PendingRecord) {
			return s.rejectLocked("conflict", "请求标识已用于上次修改。")
		}
		return s.existingLocked(recovered)
	}
	if pending := s.admitting; pending != nil && pending.input.RequestID == in.RequestID {
		if !sameSubmission(pending.input, in) {
			return s.rejectLocked("conflict", "请求标识已用于另一项修改。")
		}
		s.mu.Unlock()
		select {
		case <-pending.done:
			result := clone(pending.result)
			if result.Outcome == "accepted" {
				result.Outcome = "existing"
			}
			return result
		case <-ctx.Done():
			return SubmitResult{Outcome: "interrupted", Message: "等待受理应答已中断，请用同一请求标识查看状态。", Snapshot: s.GetSnapshot()}
		}
	}
	if recovery := s.state.Recovery; recovery != nil {
		outcome, message := "", ""
		if !recovery.Ready {
			outcome, message = "recovery_query_required", "请先重新查询上次修改关联的当前默认。"
		} else if in.RecoveryRequestID != recovery.Record.RequestID {
			outcome, message = "recovery_ack_required", "上次修改仍可能完成；请阅读旧目标说明后明确提交新修改。"
		}
		if outcome != "" {
			return s.rejectLocked(outcome, message)
		}
	}
	if s.state.Busy {
		return s.rejectLocked("busy", "已有修改结果未定，请等待系统返回并完成回读。")
	}
	attempt := &admission{input: in, done: make(chan struct{})}
	s.admitting = attempt
	s.state.Busy = true
	s.mu.Unlock()
	fail := func(out, msg string, obs *association.DefaultObservation) SubmitResult {
		s.mu.Lock()
		s.state.Busy = s.state.Recovery != nil && !s.state.Recovery.Ready
		s.admitting = nil
		v := s.changedLocked()
		result := SubmitResult{Outcome: out, Message: msg, Observation: obs, Snapshot: v}
		attempt.result = clone(result)
		s.decideLocked(in, result)
		close(attempt.done)
		s.mu.Unlock()
		s.publish(v)
		return result
	}
	if !in.Expected.Known {
		return fail("preflight_error", "请先查询当前默认，再明确选择应用副本。", nil)
	}
	kind := "identifier"
	if in.Association.Kind == "scheme" {
		kind = "scheme"
	} else if in.Association.Kind != "file" {
		return fail("invalid", "关联种类无效。", nil)
	}
	entries, resolveErr := s.catalog.Resolve(ctx, []catalog.Input{{Kind: kind, Value: in.Association.Key}})
	resolved := false
	for _, entry := range entries {
		if entry.Resolved && entry.Association == in.Association {
			resolved = true
		}
	}
	if resolveErr != nil || !resolved {
		return fail("invalid", "关联尚未解析，不能修改默认应用。", nil)
	}
	fresh, err := s.Query(ctx, in.Association)
	if interrupted := ctx.Err(); interrupted != nil {
		return fail("interrupted", interrupted.Error(), nil)
	}
	if fresh.Superseded {
		return fail("preflight_error", "当前查询已被更新的查询替代，请查看最新默认后重新选择。", nil)
	}
	if err != nil || fresh.Default.Error != nil {
		if err != nil {
			return fail("preflight_error", err.Error(), nil)
		}
		return fail("preflight_error", fresh.Default.Error.Message, &fresh.Default)
	}
	if !fresh.Default.Known {
		return fail("preflight_error", "当前默认尚未获得有效观察。", &fresh.Default)
	}
	if in.Expected.Known && appPath(fresh.Default.App) != in.Expected.Path {
		return fail("changed", "用户查看的默认已变化，请重新选择。", &fresh.Default)
	}
	if appPath(fresh.Default.App) == in.TargetPath {
		return fail("no_change", "目标已经是当前具体应用副本。", &fresh.Default)
	}
	app, err := s.reader.ReadApplicationCopy(ctx, in.TargetPath)
	if interrupted := ctx.Err(); interrupted != nil {
		return fail("interrupted", interrupted.Error(), nil)
	}
	if err != nil {
		return fail("target_unavailable", err.Error(), nil)
	}
	if !app.Usable() || app.Path != in.TargetPath {
		return fail("target_unavailable", "目标应用副本不可用。", nil)
	}
	req := Request{PendingRecord: PendingRecord{RequestID: in.RequestID, Association: in.Association, Target: app, Preflight: fresh.Default, Phase: "accepted", AcceptedAt: now()}, BatchID: batchID, Readback: Readback{State: "pending"}}
	if err := ctx.Err(); err != nil {
		return fail("interrupted", err.Error(), nil)
	}
	s.mu.Lock()
	exiting := s.state.Quit.Exiting
	recoveryReady := s.state.Recovery == nil || s.state.Recovery.Ready
	s.mu.Unlock()
	if exiting {
		return fail("exiting", "应用正在退出，不再受理新修改。", nil)
	}
	if !recoveryReady {
		return fail("recovery_query_required", "上次修改关联的当前查询已失败，请重新查询后再明确提交。", nil)
	}
	var admittedBatch *Batch
	if batchID != "" {
		s.mu.Lock()
		admittedBatch = clone(s.state.Batch)
		s.mu.Unlock()
		for i := range admittedBatch.Items {
			if admittedBatch.Items[i].RequestID == in.RequestID {
				admittedBatch.Items[i].Status = "waiting"
			}
		}
		admittedBatch.State = "waiting"
		admittedBatch.Revision++
	}
	err = s.store.Update(context.Background(), func(doc *config.Document) error {
		data, e := json.Marshal(req.PendingRecord)
		if e != nil {
			return e
		}
		doc.Pending = data
		if admittedBatch != nil {
			doc.Batch, e = json.Marshal(admittedBatch)
			if e != nil {
				return e
			}
		}
		return nil
	})
	if err != nil {
		return fail("storage_error", "未提交：保存未定记录失败。"+err.Error(), nil)
	}
	s.mu.Lock()
	if admittedBatch != nil {
		s.state.Batch = admittedBatch
	}
	if s.state.Quit.Exiting {
		s.mu.Unlock()
		return fail("exiting", "应用正在退出；已保存未定记录，不再调度系统修改。", nil)
	}
	s.state.Requests = append(s.state.Requests, req)
	s.state.ActiveRequestID = in.RequestID
	s.state.Recovery = nil
	s.submissions[in.RequestID] = in
	s.admitting = nil
	v := s.changedLocked()
	attempt.result = clone(SubmitResult{Outcome: "accepted", Request: &req, Snapshot: v})
	close(attempt.done)
	s.mu.Unlock()
	s.publish(v)
	go s.dispatcher.Dispatch(in.Association, app, func() { s.submitted(in.RequestID) }, func(nativeErr *NativeError) { s.completed(in.RequestID, nativeErr) })
	return SubmitResult{Outcome: "accepted", Request: clone(&req), Snapshot: v}
}
func (s *Service) writable(kind string) bool {
	for _, allowed := range s.options.WritableKinds {
		if allowed == kind {
			return true
		}
	}
	return false
}

// Requery is read-only; it never dispatches or replays a setter.
func (s *Service) Requery(ctx context.Context, a association.Association) (Snapshot, error) {
	_, err := s.Query(ctx, a)
	return s.GetSnapshot(), err
}

func appPath(a *association.AppCopy) string {
	if a == nil {
		return ""
	}
	return a.Path
}
func (s *Service) submitted(id string) {
	s.mu.Lock()
	r := s.findRequestLocked(id)
	if s.state.Quit.Exiting || r == nil || r.SubmittedAt != "" || r.Completion.Known {
		s.mu.Unlock()
		return
	}
	r.SubmittedAt = now()
	r.Phase = "submitted"
	v := s.changedLocked()
	s.mu.Unlock()
	s.publish(v)
}
func (s *Service) completed(id string, nativeErr *NativeError) {
	s.mu.Lock()
	r := s.findRequestLocked(id)
	if s.state.Quit.Exiting || r == nil || r.Completion.Known {
		s.mu.Unlock()
		return
	}
	r.Completion = Completion{Known: true, Error: clone(nativeErr), CompletedAt: now()}
	r.Phase = "completed"
	v := s.changedLocked()
	s.mu.Unlock()
	s.publish(v)
	go s.finishReadback(id)
}
func (s *Service) finishReadback(id string) {
	s.mu.Lock()
	r := s.findRequestLocked(id)
	if s.state.Quit.Exiting || r == nil || s.state.ActiveRequestID != id || r.Phase == "resolved" {
		s.mu.Unlock()
		return
	}
	a := r.Association
	s.mu.Unlock()
	_, _ = s.Query(context.Background(), a)
}

func (s *Service) clearPending(id string) error {
	s.batchMu.Lock()
	defer s.batchMu.Unlock()
	s.mu.Lock()
	batch := s.settledBatchLocked(id)
	s.mu.Unlock()
	err := s.store.Update(context.Background(), func(doc *config.Document) error {
		if len(doc.Pending) == 0 {
			return nil
		}
		var p PendingRecord
		if err := json.Unmarshal(doc.Pending, &p); err != nil {
			return err
		}
		if p.RequestID == id {
			doc.Pending = nil
		}
		if batch != nil {
			var err error
			doc.Batch, err = json.Marshal(batch)
			if err != nil {
				return err
			}
		}
		return nil
	})
	if batch != nil {
		s.mu.Lock()
		if err != nil {
			batch.State = "paused"
			batch.Error = "保存批次结果失败：" + err.Error()
		}
		s.state.Batch = batch
		s.mu.Unlock()
	}
	return err
}

// Query publishes one shared observation. A query begun before completion can
// update current facts, but cannot settle the request's post-completion readback.
func (s *Service) Query(ctx context.Context, a association.Association) (association.QueryResult, error) {
	// Configuration errors block writes but cannot prevent read-only browsing.
	_ = s.ensureLoaded()
	s.mu.Lock()
	if s.state.Quit.Exiting {
		s.mu.Unlock()
		return association.QueryResult{}, context.Canceled
	}
	settleID := ""
	if r := s.findRequestLocked(s.state.ActiveRequestID); r != nil && r.Association == a && r.Completion.Known && r.Phase != "resolved" {
		settleID = r.RequestID
	}
	s.mu.Unlock()
	result, err := s.queries.Query(ctx, a)
	if err != nil {
		return result, err
	}
	s.mu.Lock()
	if s.state.Quit.Exiting {
		s.mu.Unlock()
		return association.QueryResult{}, context.Canceled
	}
	if result.Superseded {
		s.mu.Unlock()
		return clone(result), nil
	}
	if !s.observeLocked(result) {
		s.mu.Unlock()
		return clone(result), nil
	}
	stateChanged := s.state.Recovery != nil && s.state.Recovery.Record.Association == result.Association
	s.observeRecoveryLocked(result)
	clearID := ""
	if r := s.findRequestLocked(settleID); r != nil && s.state.ActiveRequestID == settleID && r.Phase != "resolved" {
		stateChanged = true
		r.Readback = Readback{State: "failed", Observation: clone(result.Default)}
		if result.Default.Trustworthy() {
			r.Readback.State = "valid"
			r.Confirmed = r.Completion.Error == nil && appPath(result.Default.App) == r.Target.Path
			r.Phase = "resolved"
			clearID = settleID
		}
	}
	// Browsing updates only one observation. Do not clone or broadcast the
	// growing history (including every app icon) for each startup query.
	// Recovery and request transitions still publish their lifecycle state.
	var snapshot *Snapshot
	if stateChanged {
		value := s.changedLocked()
		snapshot = &value
	} else {
		s.state.Version++
	}
	s.mu.Unlock()
	s.publishObservation(result)
	if snapshot != nil {
		s.publish(*snapshot)
	}
	if clearID != "" {
		clearErr := s.clearPending(clearID)
		s.mu.Lock()
		if s.state.Quit.Exiting {
			s.mu.Unlock()
			return association.QueryResult{}, context.Canceled
		}
		if r := s.findRequestLocked(clearID); r != nil && clearErr != nil {
			r.StorageError = &StorageIssue{Operation: "clear", Message: clearErr.Error()}
		}
		if s.state.ActiveRequestID == clearID {
			s.state.Busy = false
			s.state.ActiveRequestID = ""
		}
		v := s.changedLocked()
		s.mu.Unlock()
		s.publish(v)
		s.kickBatch()
	}
	return clone(result), nil
}
func (s *Service) observeLocked(result association.QueryResult) bool {
	for i := range s.state.Observations {
		if s.state.Observations[i].Association == result.Association {
			if result.Version <= s.state.Observations[i].Version {
				return false
			}
			s.state.Observations[i] = clone(result)
			return true
		}
	}
	s.state.Observations = append(s.state.Observations, clone(result))
	return true
}
