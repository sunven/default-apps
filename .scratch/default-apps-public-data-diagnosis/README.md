# Debug evidence: public.data default application rejection

On 2026-11-10, the installed macOS rejected the public NSWorkspace setter for public.data before showing a consent dialog.

- Open It target: NSCocoaErrorDomain 256, underlying NSOSStatusErrorDomain -50.
- TextEdit target (the existing default): identical error.
- Control: public.plain-text → existing TextEdit default completed without error.
- System log at 12:09:54.412: `changing default handler: bindable public.data failed validation`.
- Re-registering Open It did not change the result.
- Temporarily repairing its ad-hoc signature did not change the result. Original installed app files were restored and verified against the backup, then re-registered.
- No unresolved request remained. Open It was not made the default.

`reproduce.m` is a standalone diagnostic harness that invokes the same public NSWorkspace API as the app. It changes the requested association if the system accepts it; run only with authorization for that type and target.

Compile: `xcrun clang -fobjc-arc -framework AppKit -framework UniformTypeIdentifiers reproduce.m -o reproduce`

Original failing invocation: `./reproduce public.data '/Applications/Open It.app'`

This evidence does not establish that every other file type or every macOS version behaves the same way. A concrete intended file type is needed to continue setting Open It as the default.
