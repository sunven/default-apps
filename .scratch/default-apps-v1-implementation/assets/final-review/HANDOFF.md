# Final review fix handoff

Read [README.md](README.md) for the three-finding resolution mapping, original separate reports, red/green logs and validation scope.

## Integration boundary

- Worktree: `/Users/sunven/.codex/default-apps-implementation-20261105/worktrees/final-fixes`.
- Branch: `implement/default-apps-final-fixes`, based on integration `e5e950918ff9808fc8eaafa1b978767abb723511`; integration tip merged before handoff.
- Production changes: `frontend/src/App.tsx` and new `frontend/src/useAssociationQueries.ts`.
- Public tests: `frontend/src/App.regressions.test.tsx` (10 cases) and `internal/discovery/reparse_test.go` (one full-source scan scenario).
- Source validation complete: 55 React tests, TypeScript/production frontend build, focused public discovery race check, diff whitespace check.

## Behavior to preserve

The reducer's local token orders transport failures, which have no authoritative server version. A failed call can publish only if it remains the latest issued call for that association and no newer observation has been accepted since issuance. Snapshots advance an observation only by server version; equal snapshot observations do not clear a newer transport error. Accepted direct replies can clear the matching error. `QueryResult.superseded` never supplies a fresh fact. Detail and row render from the same observation/error state.

Return uses a request-backed detail overlay, preserving the underlying view session. It retains the original association even if the catalog is empty or later loses the identity. Missing entries display `此关联已不在当前目录中；仍按原修改请求查询。`. This entry does not fabricate declaration provenance or change the request target/outcome. Closing the overlay restores focus to Return and reuses the prior browser selection.

Reparse starts full discovery rather than calling common-seed `List()`. Existing full discovery owns all source merging. Completed snapshots follow a matching source only when unique. Saved manual `unavailable:` entries use their recorded canonical identity; newly ambiguous sources close detail and prompt explicit list selection. Pending reparse selection tracking is cleared when the user navigates or dismisses the dialog. Scanning does not disable an already resolved detail's query action. Original unavailable-copy filtering remains intact.

## Remaining integration work

Root owns the fresh merge review, ordinary/development `.app` rebuild, product copy/signature/launch verification, and focused formal Wails scenarios. The native behavior coverage and limitations recorded in assets 07/08/11 remain applicable; this task adds no native setter or system-confirmation evidence. No original decision map or ticket status was changed here, and this handoff does not mark the entire implementation complete.

Post-handoff completion: merged, rebuilt, verified and cleaned up by root. See [DELIVERY.md](DELIVERY.md) and `worktree-cleanup.json`; the above remaining-work list records the original handoff checkpoint.
