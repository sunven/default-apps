import AppKit
import ApplicationServices
let pid=pid_t(CommandLine.arguments[1])!
func attr(_ e:AXUIElement,_ key:String)->CFTypeRef?{var value:CFTypeRef?;AXUIElementCopyAttributeValue(e,key as CFString,&value);return value}
func dump(_ e:AXUIElement,_ level:Int){if level>8{return};let role=attr(e,kAXRoleAttribute) as? String ?? "";let title=attr(e,kAXTitleAttribute) as? String ?? "";let value=attr(e,kAXValueAttribute) as? String ?? "";let position=attr(e,kAXPositionAttribute);let size=attr(e,kAXSizeAttribute);print(String(repeating:" ",count:level)+"\(role) | \(title) | \(value) | \(String(describing:position)) | \(String(describing:size))");for child in attr(e,kAXChildrenAttribute) as? [AXUIElement] ?? [] {dump(child,level+1)}}
let app=AXUIElementCreateApplication(pid)
if let windows=attr(app,kAXWindowsAttribute) as? [AXUIElement],let first=windows.first{dump(first,0)}
