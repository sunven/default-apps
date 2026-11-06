# Ticket 10 evidence — completed

2026-11-06, macOS 27.2 / Apple Silicon. Production source commit `bea515331619cd1e24203e0e1dd69296f0cb7bd4`, based on integration `ae714e2` (09 final code `0077afc`). Both file types and URL schemes use the one existing durable coordinator and native callback owner. Final changes after that commit add tests and evidence only. This run uses production React/Wails and real NSWorkspace; no `change_smoke` or `native_adapter_test` adapter is present in the acceptance app.

| Check | Layer | Status | Evidence |
|---|---|---|---|
| Production exposes both writable kinds | Public Go service | 通过 | `environment-red.log`, `environment-green.log` |
| Scheme reaches deferred native queue; copied raw NSError; duplicate completion ignored; file/scheme numeric owners stay separate | Controlled external native boundary | 通过 | `scheme-boundary-red.log`, `scheme-boundary-green.log` |
| HTTP/HTTPS identity and independent observations, scheme→file gate, exact copy/error/readback, recovered scheme unknown and acknowledgement | Public Go service / controlled system | 通过 | `scheme-rules-green.log`; existing file→scheme test retained |
| Existing storage/coordinator/query/discovery regression | Go race | 通过 | `go-tests.log` (`go test -race ./...`) |
| Scheme pending/reload blocks file and HTTPS actions; failed readback stays gated; requery does not submit; raw scheme errors remain visible | Production React through Wails boundary mocks | 通过 | `react-tests.log`: all44 tests; `react-scheme-final.log`: final11 Changes tests including added scheme raw-error variant (45 total cases after this addition) |
| Signed ordinary and observability builds, production exclusions / minimum13.0 | Build | 通过 | `build.log`, `source-build.json`, `production-inputs.txt`, `production-signature.txt`, `production-floor.txt` |
| Fresh immutable fixture identity, before-registration collision check and independent daily baseline | Native read-only | 通过 | `manifest.json`, `daily-before.json`, `dedicated-before.json`, `registration.json`, `dedicated-registered.json` |
| Establish A from observed B, then mandatory A→B→A through formal UI | Formal native / independent query | 通过 | `formal-native.jsonl`, `native-trace.json`, `establish-a-independent.json`, `a-to-b-independent.json`, `b-to-a-independent.json` |
| Protocol candidate and application declaration views share current path / request; real frontend reload and requery issue no setter | Formal native | 通过 | `app-view-b.png`, `b-to-a-confirmed-app-row.png`, `protocol-view-final-a.png`, `reloaded-scheme-details.png`, `final-request-snapshot.json` |
| Minimum content1000×700, DOM1001×701, no horizontal overflow | Formal native | 通过 | `minimum-geometry.json`; inspected actual WKWebView PNGs |
| Actual scheme system consent or sustained pending browsing/reload | Formal native | 尚未观察 | All three native requests completed within14ms of acceptance; no prompt seen. Controlled scheme wait/reload and 09 genuine native pending lifecycle remain separate evidence. |
| Normal native menu quit and targeted cleanup | Formal native / fresh independent query | 通过 | `quit-hooks.jsonl`, `final-process-exit.json`, `cleanup-commands.json`, `dedicated-after-cleanup.json`, `cleanup-result.json` |
| Daily defaults **and candidates** identical before, after run, after cleanup | Native read-only | 通过 | `daily-comparison.json` and three daily snapshots (21 query identities) |

The fresh dedicated scheme is `defaultapps-acceptance-3a3a1716722f4165ab1af27186902b3f`. Manifest-owned inert app copies live outside the product bundle under `native10-3a3a1716722f4165ab1af27186902b3f/fixtures`. Only the exact A/B paths were registered and unregistered. Their file type was retained as a read-only cross-kind control: it remained B while the scheme changed independently. No daily scheme or file default was written.

The formal UI issued these three distinct requests in PID68930:

- `244a1bdb-4d18-4993-bb25-5da7d0f98088`: observed B→A establishment from the protocol candidate button.
- `58ac4489-92c5-47a2-841b-9fcddd9e8420`: A→B from the protocol candidate button.
- `28d480e4-70af-4bf9-8719-ff96de4e3bf4`: B→A from A's application declaration row.

Each received nil native NSError, then matched the exact selected canonical path in the production readback and a separate Swift NSWorkspace process. `results.json` retains full target/preflight/completion/readback facts and `native-runtime.log` records all three actual main-thread starts and callbacks. No additional start occurred during application/protocol navigation, frontend reload or requery. No system dialog was observed and no human consent action was requested or automated. There is no claim that all schemes behave this way.

Same-ID mismatch, real refusal (`NSCocoaErrorDomain` /256), undeclared manual-app acceptance and actual system-pending quit/restart were already observed for file types in [09](../09/README.md). Those interactions use the unchanged coordinator and callback ownership. This ticket did not repeat those human interactions for a scheme; controlled scheme tests verify raw-error and copy-mismatch semantics. A current exact path never confirms a recovered old request. No automatic replay, cancellation mapping or retry was added.

The optional extra JS runtime event listener collected no events (`a-to-b-events.json`, `b-to-a-events.json` are empty). These files do not prove acceptance-stage UI rendering. The durable service snapshots, real native trace and independent readbacks provide the actual completion evidence. The first new service test initially returned before asynchronous record clearing, producing temporary-directory cleanup races (`scheme-rules.log`); it was corrected to await the public settled gate, and final focused/full race checks passed. The first capability-test setup lacked generated frontend assets; after `npm ci` and build, `environment-red.log` captures the meaningful expected failure.

No pending record remained at normal Quit. The native `ShouldQuit` hook returned true; the process exited before the observation helper could write its response, and external `ps` verified termination. After exact-path unregistration, dedicated default and candidate queries returned empty and all daily snapshots were identical. Inert files remain available in the external fixture directory; no claim is made that Launch Services history was erased. No global database reset was used.

The acceptance scripts are isolated tooling: `prepare-native.py` refuses to overwrite its baseline, `build-fixtures.py` refuses to overwrite the immutable manifest, and `native-client.py` drives production DOM buttons and query-only evidence calls. `manual_smoke`, `lifecycle_smoke`, `native_acceptance` and Wails `mcp` provide observation/configuration only. Ordinary `production` inputs exclude those implementations, controlled adapters and test macros. Wails3.1.0 / Go1.27.3 were verified; observed Node26.13.0/npm11.20.0 are recorded in `environment.json` rather than copied from historical environment notes.
