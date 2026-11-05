import AppKit
let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String:Any]] ?? []
for window in windows {
 if let name=window[kCGWindowOwnerName as String] as? String, name.lowercased().contains("default") {
  let data=try! JSONSerialization.data(withJSONObject:window,options:[.sortedKeys])
  print(String(data:data,encoding:.utf8)!)
 }
}
