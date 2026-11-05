# Ticket 05 evidence — work in progress

Implementation: manual inputs/application paths through the public service, shared version-1 atomic JSON storage, restored catalog provenance, native URL metadata identification and Wails file/application selectors. No setter is linked or invoked by this ticket.

- `go-test.log`: config, manual service, discovery and native metadata tests passed with the race detector and macOS 13 compilation/linking flags. Public behaviors include ambiguous choices, cancellation, unknown inputs, alias deduplication versus separate copies, unavailable/reappearing paths, restart reconstruction, corruption/version preservation, concurrent storage mutations, failed atomic rename and failed save honesty.
- `frontend-test.log`: six actual React interaction tests at the generated Wails service seam. Ambiguity requires choice; file cancellation preserves draft; save failure never appears saved; edits invalidate prior choice; app copies show complete paths and no submitted default request; corrupt configuration is visible and cannot be overwritten.
- `ordinary-inputs.json`: regular Go build input excludes `configuration_smoke.go`, `manual_smoke.go`, and Objective-C picker test helper. No production override is available.
- `HANDOFF.md`: shared storage contract for ticket 06 pending-record save/conditional clear.
- `check-native.py`: reviewable formal-window test procedure, awaiting shared-desktop availability after ticket 04. Native panel actions use public AppKit on the owning process; no Accessibility/system-confirmation automation. Fixture/config root is outside automatic app scan roots and outside real user configuration.

Remaining evidence: actual formal-window picker success/cancel, ambiguity/unknown state, outside-scan copy selection, cross-process configuration, native screenshots and final integration. These are not yet claimed passed.
