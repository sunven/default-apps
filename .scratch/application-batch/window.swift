import AppKit
import ApplicationServices
let pid=pid_t(CommandLine.arguments[1])!
let windows=CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] ?? []
let matches=windows.filter{($0[kCGWindowOwnerPID as String] as? Int)==Int(pid)}
let data=try JSONSerialization.data(withJSONObject:matches,options:[.sortedKeys]);print(String(data:data,encoding:.utf8)!)
