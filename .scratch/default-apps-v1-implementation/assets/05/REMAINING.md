# Ticket 05 continuation and integration history

The previously pending native acceptance below was completed on 2026-11-06 using genuine human-operated NSOpenPanel selections. See `README.md` and `human-*.json`: known and unknown file success, first app/alias/second copy, separate association chooser, actual new-PID restart, original-path unavailable/reappearing UI, and unchanged independent defaults all passed. This file preserves the earlier continuation instructions and automation limitations. Ticket 04 layout composition is still a separate integration check.

## Current evidence

- Actual Wails UI: real `jpg` ambiguity listed `public.jpeg` and `com.microsoft.ppt.export.ext.jpg`; no choice initially selected; only `public.jpeg` was saved after explicit radio selection. Unknown input shows dynamic diagnostic and disabled save.
- Actual Wails native panels: file and application cancellation both return without changing committed configuration (`native-file-cancel.json`, `native-app-cancel.json`). Correct file/package/filter settings were observed.
- Actual quit and new process: manual JPEG and normalized `manual+05` restored, provenance merged, scheme view queried current default afresh (`native-restart.json`, prior PID 47448, new PID 47638). Test process then quit; exact PID no longer present. 04's PID 44619 was untouched.
- Native URL metadata adapter: known `.txt` → `public.plain-text`; unknown file remains dynamic; missing file yields error, all passed by Go native test.
- Before/after independent seed/default/candidate queries are byte-equivalent as JSON (`baseline-check.json`). No setters, explicit fixture registration or fixture execution occurred. Test apps have no handling declarations.

## Why automated picker success stopped

macOS 27.2 hosts these open panels using `NSRemoteView`/OpenAndSavePanelService. Public `NSSavePanel ok:` raises “not implemented” (initial tagged helper exception log preserved; now caught). Setting directory/nameField followed by in-process native Return or Cmd-Shift-G/text/Return never selected any URLs. AppKit activation/unhide and System Events activation did not make the app key/active; Orca remained frontmost. The native helper reports NSWindow.visible=true while Wails/MCP reports visible=false. Cancellation works. These are helper/environment limitations, not evidence of a product failure or success. No forced URL injection, fake panel result, or system-confirmation action was used.

## Exact human continuation

1. From this worktree run `python3 .scratch/default-apps-v1-implementation/assets/05/launch-smoke.py`. Config is isolated at `/Users/sunven/.codex/default-apps-implementation-20261105/manual05-native/Application Support/Default Apps/config.json`; real user config is untouched.
2. Bring **Default Apps Manual QA.app** to front. Click **手动补充… → 选择文件识别类型…**. In the native panel select `/Users/sunven/.codex/default-apps-implementation-20261105/manual05-native/selected.txt`; observe `public.plain-text`, then **保存手动关联**.
3. Repeat picker success with `selected.defaultappsunknown05` in that same folder. Observe unresolved/dynamic reason and disabled save.
4. Click **添加应用位置…** and select `outside-one/Manual Reader.app`, then `Manual Alias.app`, then `outside-two/Manual Reader.app` under that folder. First and alias should remain one stored copy; second location adds a separate copy with same bundle ID and version 2.0. This does not submit a default-app request.
5. Through an association's **选择其他应用…** select either fixture and observe concrete path plus “尚未提出修改默认应用的请求。”
6. Quit and relaunch using the same launch script. Verify both manual copies and the file/scheme associations remain, with current defaults freshly queried. Remove/move only one fixture bundle temporarily, rescan, and observe the saved original path marked unavailable; put it back and rescan.
7. Save actual DOM/native results and screenshot evidence, compare independent queries again, then resolve the ticket. `check-native.py` is a harness draft for automated paths; its `first` mode expects empty isolated config and its native selection helper is currently insufficient. Do not delete the saved config to force it without preserving this evidence.

## Integration with ticket 04

04 errored on agent rate limit before committing its new App layout. To make 05 reviewable/native-testable, this branch adds only minimal ManualActions/ManualApplicationAction slots to the existing App and copies the agreed shared Dialog rules. When 04 merges, retain its layout and insert:

- Header: `<ManualActions />`.
- Unresolved detail: `<ManualActions label="选择文件识别类型…" showStorageWarning={false}/>`.
- Candidates detail: `<ManualApplicationAction association={selected.association}/>`.
- Saved unavailable apps: show `app.metadataError`/original path; do not show declarations or substitute another copy.

`frontend/src/Dialog.tsx` is byte-identical to 04's supplied component. Remove duplicate dialog CSS from `manual.css` after 04's `app.css` carries it. The minimal original App tests now mock GetStatus and all 20 combined UI tests pass. Recheck layout composition after merge; native screenshots here predate04.
