# Final review fixes — 2026-11-06

Baseline: `e5e950918ff9808fc8eaafa1b978767abb723511` on `integration/default-apps-v1`. Implementation branch: `implement/default-apps-final-fixes`.

The original [Standards report](standards-original.md) and [Spec report](spec-original.md) are preserved separately. Their four reported P2 items contain three distinct defects; the row-error finding overlaps. The unavailable-copy filtering concern was suppressed by the reviewers under desktop decision 09 line 58 and was not changed.

## Resolution and evidence

| Finding | Final behavior | Public regression and evidence |
| --- | --- | --- |
| Standards P2 / Spec P2: old query transport errors override newer observations | `useAssociationQueries` accepts results and transport errors for each canonical association in one reducer. An accepted result clears that association's error. Rejections are fenced by local issuance and the observation version at issuance, covering newer direct replies and authoritative snapshots. Duplicate/older snapshot observations cannot erase a newer error; `superseded` replies remain ignored. Row and detail use the same error state. | React foreground failure → success: [red](01-query-red.log), [green](01-query-green.log). Late rejection after newer foreground result or change snapshot: [red](02-late-rejection-red.log), [green](02-late-rejection-green.log). Final React suite also checks selected row/detail recovery, cached snapshots, old observations and superseded replies. |
| Spec P2: returning to a disappeared request opens another association | Return opens an independent detail entry with the original canonical association. Missing discovery entries explain their absence and query the original identity. The browser's view, query, selected row and scroll are retained, and Escape returns focus to the Return button. Existing immutable request target/outcome remain owned by the change service. | Actual React actions remove the sole declaration, Return, inspect the exact queried identity and original target, close, and check file/scheme sessions: [red](03-request-return-red.log), [green](03-request-return-green.log). |
| Spec P2: reparse discards the fresh catalog / omits declaration and manual sources | Reparse invokes full `StartScan`, whose existing service reevaluates common, declaration and saved manual inputs. Progress retains neighboring entries; newer completed snapshots replace the catalog and follow the original source when unambiguous. A saved manual identity is restored exactly; new ambiguity closes detail and asks for an explicit type choice. Still-unresolved input stays query-disabled. | React common/declaration/manual cases: [red](04-reparse-red.log), [green](04-reparse-green.log). Saved identity among ambiguous resolutions: [red](05-manual-identity-red.log), [green](05-manual-identity-green.log). Public discovery reparse with replaceable resolver, bundle reader and atomic config verifies real service source retention: [race result](discovery-reparse.log). |

## Validation

- `npm ci` used the existing lockfile; no dependency change.
- `npm test -- --reporter=verbose`: **55 tests passed** in six files; [complete log](react-tests.log).
- `npm run build`: **passed**, including TypeScript and production Vite assets; [green log](frontend-build.log). Initial TypeScript issues in the new test fixtures and callback annotation were corrected; [initial log](frontend-build-types-red.log) remains as evidence.
- `go test -race ./internal/discovery -run TestFullRescanReparsesCommonDeclaredAndSavedInputsWithoutLosingSources -count=1 -v`: **passed**; [log](discovery-reparse.log). This confirms the existing full-scan boundary; no Go production change was required.
- `git diff --check`: passed before commit.

These tests reuse the [previously approved seams](SEAMS.md). The source changes are limited to frontend query acceptance, request detail presentation, and reparse actions/selection. No native setter, request coordinator, recovery, quit, storage, discovery implementation, or unavailable-copy filtering changed.

Post-merge integration verification is complete: [final delivery report](DELIVERY.md), four formal Wails checks, rebuilt signed ordinary/development apps, actual launch/normal exit, stable binary hashes and worktree cleanup. No real OS association write or system consent interaction occurred in this fix task.
