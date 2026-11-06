import AppKit
import CoreGraphics
let pid=pid_t(CommandLine.arguments[1])!
let action=CommandLine.arguments.count>2 ? CommandLine.arguments[2] : "observe"
if let app=NSRunningApplication(processIdentifier:pid) {
 if action=="activate" {app.activate(options:[.activateIgnoringOtherApps]);Thread.sleep(forTimeInterval:0.3)}
 if action=="quit" {print(app.terminate());exit(0)}
}
let windows=(CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] ?? []).filter{($0[kCGWindowOwnerPID as String] as? Int)==Int(pid)}
print(String(data:try! JSONSerialization.data(withJSONObject:windows,options:[.sortedKeys]),encoding:.utf8)!)
