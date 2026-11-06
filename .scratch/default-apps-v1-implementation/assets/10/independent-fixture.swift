import AppKit
import UniformTypeIdentifiers
let identifier = CommandLine.arguments[1]
let scheme = CommandLine.arguments[2]
func app(_ url: URL?) -> Any {
    guard let url else { return NSNull() }
    let resolved = url.resolvingSymlinksInPath().standardizedFileURL
    let reference = (resolved as NSURL).fileReferenceURL()
    let canonical = reference.flatMap { ($0 as NSURL).filePathURL } ?? resolved
    return ["rawPath": url.path, "path":canonical.path]
}
let workspace = NSWorkspace.shared
let type = UTType(identifier)
let url = URL(string:scheme+":dedicated-acceptance")!
let result:[String:Any] = [
    "date":ISO8601DateFormatter().string(from:Date()), "readOnly":true,
    "type":["identifier":identifier, "declared":type?.isDeclared ?? false, "dynamic":type?.isDynamic ?? false,
      "current":type.map {app(workspace.urlForApplication(toOpen:$0))} ?? NSNull(),
      "candidates":type.map {workspace.urlsForApplications(toOpen:$0).map {app($0)}} ?? []],
    "scheme":["key":scheme,"current":app(workspace.urlForApplication(toOpen:url)),"candidates":workspace.urlsForApplications(toOpen:url).map {app($0)}]
]
print(String(data:try! JSONSerialization.data(withJSONObject:result,options:[.prettyPrinted,.sortedKeys]),encoding:.utf8)!)
