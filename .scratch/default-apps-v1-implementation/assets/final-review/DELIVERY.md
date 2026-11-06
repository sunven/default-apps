# Final integrated delivery — 2026-11-06

The eleven implementation tickets and mandatory final review are complete on `integration/default-apps-v1`. Fixed review baseline: `c3ec3202bed542d99709a3f2b6379e977c117e1d`; reviewed pre-fix tip: `e5e950918ff9808fc8eaafa1b978767abb723511`. Fix commit `79e10dca5c008450a731f66955db782d889528c0` was independently verified and merged as `8e8aaf315cc0511cdd491a7f142409043294d80d`; final product builds use `b8494ba2ba5bcc565ec21a4ae30346bb3948211c`, whose production tree is identical to that fix commit.

## Standards

The [original Standards report](standards-original.md) has one P2: stale transport errors override newer observations. The shared per-association observation/error acceptance fixes it, with issuance and server-version checks. The associated duplication heuristic refers to the same finding. Resolution and red/green evidence are in [README](README.md). Remaining findings: **0**.

## Spec

The [original Spec report](spec-original.md) has three P2 findings: Return opens an unrelated association after discovery loses the original; Reparse ignores fresh source resolutions; stale row transport error remains after successful foreground refresh. All three are fixed and tested. The third overlaps the Standards finding; the two original reports remain separate. Remaining findings: **0**.

Standards: 1 reported, highest P2, all resolved. Spec: 3 reported, highest P2, all resolved.

## Final products

Ordinary app: `/Users/sunven/github/default-apps/bin/default-apps.app`.
SHA-256 of `Contents/MacOS/default-apps`: `6e9779eef23db7b14cca494f90b5298fe67297a54d06fb314e0a93b780ec9de8`.
Development app: `/Users/sunven/github/default-apps/bin/default-apps.dev.app`; binary SHA-256 `c88ee019ca4e742b1d40e0c726b4396e70c048b281c897b3c81db3fc08407f0d`.

Both were rebuilt using the documented Wails tasks, strictly verified with ad-hoc signatures, launched as actual new processes, displayed native Default Apps windows, and exited normally with code 0. Product identity is `io.github.sunven.default-apps`, version 0.1.0, arm64; plist minimum 13.0.0 and Mach-O minos 13.0. [Product facts](products-final.json), [ordinary build](ordinary-build-final.log), [development build](development-build-final.log), [launch checks](products-check.log) and [stable artifact](deliverable-final.json) supersede the binary hashes in assets/11. Ordinary configuration was absent before and after these launches. No isolated configuration was copied.

[Final input lists](production-inputs-final.json) exclude smoke controllers and prototype assets. Ordinary embedded code has only the `production` tag; development has no acceptance tags. Go/Wails/runtime remain 1.27.3/3.1.0/3.1.0 and the existing frontend lockfile is unchanged.

## Validation after fixes

The [complete React run](react-tests.log) passes **55 tests** across six files, including ten new public interaction regressions. [TypeScript and frontend production build](frontend-build.log) pass. The [public discovery race check](discovery-reparse.log) proves all three source kinds are reparsed through existing `StartScan`. Production Go/native/request/lifecycle/storage code is unchanged; prior full Go race and native setter/callback/quit/recovery evidence from 09–11 remains applicable.

[Four final formal Wails checks](native-regressions.json) and [summary](native-summary.json) passed in one fresh process, PID 1474, normal exit code 0. The run uses actual React, native windows, config files, bundle discovery and UTType resolution, with a separately tagged controlled default/setter adapter:

- One explicit controlled request retains its exact original association and target.
- After its sole declaring bundle disappears and the scan completes, Return opens the original identity, explains its catalog absence, and queries that identity. [Native pixels](missing-request-detail.png).
- Closing Return preserves the underlying application view and its search/filter session.
- Reparse causes a new full discovery snapshot, observes a real fixture version change, preserves manual and declaration neighbors, and retains the still-unresolved source with query/write disabled. [Native pixels](unresolved-reparse.png).

Every recorded viewport is 1001×701 with zero horizontal overflow (native minimum content 1000×700). Screenshots were visually inspected. The one setter is controlled; **zero real system setters**, fixture registration, or consent interactions occurred in this final check. The final isolated config has no pending record and all QA processes exited. Same-source unresolved-to-resolved, manual identity restoration, ambiguity and transport-error ordering are proved at the public React/Go seams; the native run does not pretend the arbitrary unresolved extension became a declared type.

The [final native script](check-native.py), [build script](build-native.sh) and [product script](check-products.py) are retained. Earlier harness failures are preserved: broad `Review` search also matched Preview; scan and durable-clear assertions ran before asynchronous state settled; a resumed exit observer lacked a return-code member; runpy continuation globals overwrote the combined record. These were test-tool issues, not passing results. The final fresh run uses exact fixture search and authoritative snapshot/disk waits, retaining all four records without continuation. Earlier logs are `native-harness-*.log`; the intermediate single reparse record and resume screenshots remain explicitly labeled. Initial TypeScript fixture errors are also retained in `frontend-build-types-red.log`.

## Scope and retained native evidence

The [25-item acceptance matrix](../11/README.md) remains the full inventory; this report supersedes the affected UI and product-build evidence. Real dedicated file and protocol A→B→A passed in 09/10. File refusal, same-ID copy mismatch, undeclared-app selection and genuine pending exit/restart were actually observed. Protocol prompts or sustained waiting and all real cross-process interleavings remain unobserved; deterministic coverage retains its own layer. Daily PDF/browser/mail writes were not performed. No Launch Services reset was used.

Verified self-use environment remains macOS 27.2 / Apple Silicon. macOS 13 is a build floor; other versions/architectures and distribution/notarization are outside the accepted scope. No PR or remote action was requested or performed. Cleanup results are recorded in `worktree-cleanup.json`; stable root apps, commits and evidence remain available after implementation worktree removal.
