# 07 refresh, reload and late-result evidence

All evidence was collected on 2026-11-06. The implementation includes the integrated ticket 08 exit/recovery guards. [HANDOFF.md](HANDOFF.md) records the query and native callback contracts for subsequent tickets.

## Automated public behavior checks

| Evidence | Result and boundary |
| --- | --- |
| `query-red.log`, `query-green.log` | Public association queries: newest-issued query wins even when an older call returns last; a newer failure retains the prior valid observation. |
| `readback-fence-red.log`, `readback-fence-green.log` | Public coordinator: superseded cached replies cannot settle completion using a pre-completion value. |
| `reconcile-red.log`, `reconcile-green.log` | Original-ID query-only reconciliation, interrupted tombstone, and no delayed replay. |
| `reload-red.log`, `reload-green.log` | React reload retains exact submission and reconciles without a second Submit. |
| `event-reconcile-red.log`, `event-reconcile-green.log` | A newer accepted event ends reply uncertainty while older reconciliation is pending. |
| `catalog-red.log`, `catalog-green.log`, `disappearance-red.log` | Scan retains prior declarations; missing selected copy clears details and preserves its original path. |
| `foreground-red.log`, `foreground-green.log` | Foreground event refreshes visible identities independently from catalog scanning. |
| `native-cancel-red.log`, `native-cancel-green.log`, `cancellation-green.log` | Native run exposed cancellation misclassified as target unavailable. Public tests reproduce/fix cancellation before acceptance and cancellation during durable acceptance. |
| `current-observation-red.log`, `combined-react.log` | External refresh originally left global actual-default text at the completion readback; fixed to show the newest matching observation. Final React suite: 43 tests passed. |
| `combined-go.log` | All internal Go packages passed with race detector after integration. |
| `combined-query-recovery.log` | Additional association/coordinator race checks passed, including superseded recovery observation and recovered-ID reconciliation. |
| `combined-native-build.log` | Generated bindings, production frontend, tagged native build and ad-hoc signature verification passed after the final UI fix. |
| `production-inputs.log`, `production-build.log` | Ordinary production inputs exclude the controlled adapter and native smoke driver; the untagged-by-smoke production build passed. |

These tests exercise public service/storage boundaries and rendered React behavior. They do not replace native platform evidence.

## Formal Wails app with isolated controlled adapter

The native runs use `bin/Default Apps Sync QA.app`, production React assets, real generated Wails bindings/events, and only the test-tagged controlled adapter. `launch-smoke.py` seeds `/Users/sunven/.codex/default-apps-implementation-20261105/change07-smoke`; `native-client.py` talks to the dedicated MCP port 9108 and adapter loopback control. The app scans real application declarations and uses an isolated physical `Sync Reader.app` for disappearance evidence. No native setter runs and no everyday default changes.

| Runner and evidence | Observations |
| --- | --- |
| `check-native.py`, `native-check.log`, `native-sync.json` | 14 checks: real reload during atomic admission, one accepted original ID, target observation while still pending, obsolete query arriving last, newest-query failure, scan/search/selection/scroll retention, physical bundle disappearance, missing current-default path, callback after navigation/reload, duplicate/old typed events, retained resolved result, and actual accepted HTTP reply loss. |
| `check-native-boundaries.py`, `native-boundary-check.log`, `native-boundaries.json` | 8 checks after 08 integration: accepted reply plus event loss and reload, unknown-original tombstone blocking late Submit, public Wails call cancellation before acceptance and during durable save, same original completion, real AppKit deactivate/activate refresh, and eight activation events coalesced to unique visible identities. |
| `check-native-crosscase.py`, `native-crosscase-check.log`, `native-crosscase.json` | 10 combined 08/07 checks: process recovery, original-ID reload, acknowledged replacement across held-save reload, common close-hook stay response, completion held beyond 90 seconds, and external default refresh preserving the original confirmed result. |

The first run's callback delay was 1.442 seconds; that is navigation/reload evidence, not long-duration evidence. The combined crosscase held completion for **90.039 seconds**, recorded as `heldSeconds`; the request stayed pending until the explicit callback and completed with one dispatch and one actual-initiation marker. Process restart reuses the same config without reseeding it. A matching target after restart leaves the prior request recovered/unknown and makes zero dispatcher calls. The replacement's `recoveryRequestID` survives a frontend reload; releasing its save admits exactly one original replacement. The close action here invokes Wails' common `Window.Close` hook; real menu, Cmd-Q and native button routes are ticket 08 evidence.

`pending-1000x700.png` and `resolved-1000x700.png` were captured with measured DOM viewport 1001×701 and zero horizontal document overflow. Names approximate the minimum; the recorded DOM geometry is authoritative. `foreground-1000x700.png` and all eight boundary observations used the default 1180×800 viewport, before the final actual-default fix, and are not minimum-size or final-state evidence. Final screenshots `crosscase-pending.png`, `crosscase-resolved.png` and `crosscase-resolved-detail.png` were inspected at 1001×701, with zero horizontal document overflow. The final list and detail show `/Applications/Xcode.app` as current while the global confirmed request retains `/Controlled/Other/Xcode.app` as its target. Both controlled processes are stopped; the isolated config/fixtures remain for inspection.

## Harness corrections and reproducibility

- Preserve and immediately restore the bundled `window._wails.dispatchWailsEvent` when importing `/wails/runtime.js`; a second runtime otherwise replaces React's dispatcher. The checked-in client does this.
- MCP uses `window_control` action `set_size`. A top-level JavaScript null is encoded as `"ok"`; use a boolean assertion for absence. Search input and subsequent selection require separate rendered actions. Await the discovery version plus `scanning=false` for completed scans.
- During a deliberately held configuration write, reload can mount while its unrelated startup scan remains blocked on that writer. The crosscase waits for the mounted app during reload and releases the held write separately. Waiting for scan completion there was a harness deadlock, not a product timeout.
- SIGTERM reaches the quit guard while a controlled request is pending. The clean-start runner validates the exact owned binary/PID and force-stops only that isolated controlled process; the intended recovery step also deliberately force-stops its original pending process. Failed harness attempts are not counted as passing observations.
- The last crosscase assertion initially read the association-name button instead of its whole row. The log retains that selector failure after the completed 90-second hold; `--finish` resumed only the observation/screenshot check against the same resolved process using `.closest(".association-row")`. Its final assertion and all 10 recorded checkpoints passed without repeating submission or the held callback.
- `build-smoke.sh` generates bindings and the tagged app. `launch-smoke.py` resets isolated state, so use it only for a fresh run. Process-recovery restart launches the existing binary against the same config, as the crosscase demonstrates. Preserve fixtures/evidence after inspection; each runner's assertions fail on unexpected dispatch counts or request identity.

The final checks cover synchronization and unchanged request ownership in the formal app. Real native setter lifetime, human system consent, native error shapes and file/protocol-specific behavior remain tickets 09/10; ticket 11 owns the final combined acceptance pass.
