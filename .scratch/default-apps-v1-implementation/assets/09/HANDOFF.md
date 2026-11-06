# Ticket 09 native file changes

Production `changeEnvironment` now uses `native.Dispatcher` and allows only `file`. Ticket 10 should add schemes to this same adapter/coordinator and update `TestProductionOffersFileTypeChangesOnly`; it must not introduce a second owner or bypass the accepted service path.

`internal/native/dispatcher_darwin.go` registers a monotonically allocated `uint64` before scheduling public `application.InvokeAsync`. No lock spans scheduling (which may invoke inline). The scheduled closure owns Go strings and allocates/frees C strings around the short native initiation. Native Foundation objects own copied inputs under ARC. The asynchronous block captures only the numeric ID. `submitted` runs on actual initiation, before an immediate completion is possible.

The native callback copies nullable NSError domain/code/description to native-owned bytes inside its own autorelease pool. The Go export copies these fields synchronously, atomically removes the numeric callback entry, then schedules coordinator work on a Go goroutine. Native frees bytes only after that export returns. Duplicate/unknown IDs are ignored; pending entries have no timer and no dependency on a frontend promise, listener, window, or caller context. Coordinator exit guards from 08 drop late results safely. No fixed error-code cancellation classification is added.

`native_adapter_test` controls only external Wails scheduling and the NSWorkspace completion boundary. It runs the actual C→Go error conversion with worker-thread NSError completion and duplicate callbacks. It is **not a real system result**. `native_acceptance` adds only raw start/completion logging; `manual_smoke`, `lifecycle_smoke`, and Wails `mcp` supply isolated configuration and observation/DOM/native-route actions. The real acceptance app does **not** use `change_smoke`; its query and setter are the actual NSWorkspace adapter and its React frontend is production. Ordinary build inputs exclude every helper and controlled macro.

Fresh fixture manifest is immutable `manifest.json`; bundles live outside the product app. Only A and B are initially registered, with A Copy introduced after mandatory success. Daily defaults are independently queried read-only. All real submissions come from the existing candidate/detail or application-row production button, never a direct service setter call. Read-only generated service snapshot/query calls support evidence capture.

## Real pending lifecycle already observed

Request `e5711e25-daf1-4f05-afc2-75f93a952847` was submitted from formal candidate detail to establish A from initial B at `2026-11-06T05:42:14Z`. The actual system A/B confirmation remained unanswered. While native completion was absent, the formal UI browsed schemes, queried the original association and reloaded. The pending record and gate survived.

Real NSMenu Quit, Cmd-Q menu key equivalent and NSWindow.performClose coalesced one product warning. Formal UI “留在应用” preserved PID 59842; another Cmd-Q plus “仍然退出” terminated it while completion was unknown. The pending record was retained exactly. PID 66702 reopened the same config and independently observed B, displayed old-result-unknown, and issued no setter. The original system A/B confirmation was still visible after restart. This is genuine native pending-exit evidence; it is separate from 08 controlled schedules. `native-exit.json`, `pending-durable-before-exit.json`, `processes.jsonl`, `formal-native.jsonl`, independent snapshots and screenshots retain the observations. Old completion cannot return to the new Go process and must remain unknown even if a later current observation matches A.

Human system-button reports, mandatory A→B→A success, same-ID/manual attempts and cleanup are recorded in README/results as they occur. Never infer a human button from a completion or reuse earlier permission.

## Native results now observed

Mandatory A→B and a distinct B→A request both completed successfully with nil error and exact independently queried canonical paths. Human reports and timestamps are in `human-actions.jsonl`; callbacks have their own `completedAt` in formal snapshots. A separate deliberate continue-A choice returned real `NSCocoaErrorDomain` / 256 / `The file couldn’t be opened.` and actual A. Do not turn this observation into a generic cancellation classification.

After A Copy registration, the system resolved current A to A Copy. Selecting that already-current copy yielded a no-op. Explicit original-A submission `14cea5ae-950d-4ee1-8ce4-bad1d9d54c6d` returned nil native error but read back A Copy, so production kept selected A, actual A Copy and `confirmed=false`. This directly verifies same-ID copy mismatch natively, in addition to prior controlled rules.

The native `minimum` observation action derives outer size from `frameRectForContentRect`. Native content measured1000×700; on this run the DOM rounded to1001×701, with no document horizontal overflow. Do not size a new run with a guessed728 outer height: native titlebar sizing differs here and that guessed test command briefly produced696 content, corrected in `minimum-geometry-valid.json`. No product sizing code changed.

## Completion and cleanup

The human selected undeclared app through the real picker, then a distinct formal candidate button submitted it. Human approved the actual system prompt; native completion was nil and independent canonical-path readback matched the undeclared app. This is one observed acceptance, not a promise that arbitrary undeclared apps always work. The app quit normally with no pending record. Exact manifest paths A/B/A Copy/Undeclared were unregistered and a fresh independent query returned no dedicated default or candidates. Daily observations and candidate sets before, after-run and after-cleanup were identical. All09 criteria are complete; full `results.json` and README index raw evidence. Ticket10 should make a fresh fixture namespace and baseline, use actual native scheme setter with this lifecycle, and keep production test tags excluded.
