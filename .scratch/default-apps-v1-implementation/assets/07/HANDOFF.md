# 07 synchronization handoff

Read this when wiring native queries/setters in 09/10 or validating combined behavior in 11. `internal/change.Service` remains the single request owner. The formal frontend consumes its snapshots and typed `defaultapps:change` events.

## Query ordering and request ownership

- `association.Service.Query` permits concurrent reads, issues a sequence per association, and accepts only the latest issued read. An obsolete call returns the retained result with `QueryResult.Superseded=true`; this is a cached fallback, not a fresh observation. A newer failed query retains the last valid value with its error/stale marker; a late old success cannot erase that failure.
- Every query consumer must check `Superseded` before treating a reply as fresh. Coordinator preflight rejects it; coordinator Query skips observation publication, completion settlement and recovery readiness; direct React calls ignore it. In particular, a cached pre-completion value cannot settle a later completion, and a cached successful value cannot enable recovery replacement. Preserve these checks when adding a native adapter.
- `Snapshot.Version` orders whole coordinator state. React subscribes before requesting the initial snapshot and ignores equal/older versions. Acceptance events can end an interrupted-reply state while an older reconciliation remains in flight; that old reply cannot restore uncertainty. Per-association versions independently order displayed observations.
- `ChangeStatus` displays the newest observation of the original request association as the actual default, falling back to its immutable completion readback. Its request target, completion, readback and confirmation remain historical facts. External changes update the status, row and detail without changing those facts or resubmitting.

## Original submission reconciliation

- Before `Submit`, React stores the exact `Submission` under sessionStorage `defaultapps.submission.v1`: request ID, association, target path, expected observed default, and optional `recoveryRequestID`. Storage failure prevents submission. Frontend reload restores this input and calls `ReconcileSubmission`; it never creates a replacement ID or repeats the setter.
- `ReconcileSubmission` is query-only. Accepted/recovered IDs return `existing`; an admission still running returns `pending`; retained rejections return their decision. An unknown ID receives an interrupted tombstone under the admission lock. A delayed original binding then receives that same rejection and cannot dispatch. Its wording applies to this session, without asserting the outcome of an unknown previous process.
- Same ID with changed parameters conflicts. The coordinator's `decisions` map is checked before accepted-ID lookup and terminal admission rejections are retained. Keep the recovery acknowledgement in same-submission equality. A recovered ID also checks association, target and expected preflight and can never initiate new work.
- Caller cancellation during native preflight is classified as `interrupted`, with zero dispatch. Once durable acceptance wins, caller cancellation or frontend destruction leaves the Go-owned request running. Reconciliation, refresh and reload are read operations; only a new explicit acknowledged action may replace recovered uncertainty.

## 08 and native adapter integration

- Preserve [08's exit/recovery contracts](../08/HANDOFF.md), including pre/post-save exit guards, stopped late publication, and fresh valid recovery-query gating. The combined tests include a superseded recovery query and an acknowledged replacement reloaded while the atomic save is held.
- The dispatcher contract is unchanged: call `submitted` when the native request has actually been initiated, and `complete` with a copied native error after the native completion. Completion remains attached to the original association and target across UI lifetimes. Keep native operation bookkeeping safe after exit; callback ownership must not retain or touch a window.
- `foreground.go` registers typed `defaultapps:activated` and emits on public `ApplicationDidBecomeActive`. React coalesces activation bursts for 100 ms and queries selected/visible identities. Directory scanning stays independent. There is no periodic whole-catalog query or automatic setter retry.
- During scanning, the prior apps and merged entries remain browseable. An unavailable selected copy leaves the usable app list, retains its original path notice and loses declarations; another copy with the same name/bundle ID cannot silently replace it. The current-default observation can still point at that missing path.
- `change_smoke` adds held queries/save and query logs while preserving 08's boot controls, dispatch count and actual-initiation count. `manual_smoke` adds public AppKit deactivation for foreground evidence. Production selects `DisabledDispatcher` with no writable kinds; ordinary production build inputs exclude all smoke drivers.

## Evidence and remaining native work

[README.md](README.md) indexes the tests, geometry and formal Wails scenarios. These runs use production React assets, generated bindings, the real Wails app/window and an isolated controlled system adapter. They prove synchronization and lifetime ownership, not a real macOS association setter, system confirmation or native error. Tickets 09/10 must establish those native boundaries with dedicated fixtures; 11 retains final combined keyboard/focus and acceptance verification. No actual default association was changed in this ticket.
