import AppKit
import UniformTypeIdentifiers
let workspace = NSWorkspace.shared
let extensions = ["pdf","txt","text","rtf","md","markdown","jpg","jpeg","png","gif","tif","tiff","heic","svg","html","htm","json"]
var resolutions: [[String:Any]] = []
var queries: [String:Any] = [:]
func path(_ url:URL?) -> Any { guard let url else { return NSNull() }; return url.resolvingSymlinksInPath().standardizedFileURL.path }
for ext in extensions {
 let types = UTType.types(tag:ext, tagClass:.filenameExtension, conformingTo:nil)
 resolutions.append(["input":ext,"matches":types.map { ["identifier":$0.identifier,"declared":$0.isDeclared,"dynamic":$0.isDynamic] }])
 for type in types where type.isDeclared && !type.isDynamic {
  queries["file:"+type.identifier] = ["current":path(workspace.urlForApplication(toOpen:type)),"candidates":workspace.urlsForApplications(toOpen:type).map{path($0)}]
 }
}
for scheme in ["http","https","mailto","webcal"] {
 let url=URL(string:scheme+":catalog-readonly")!
 queries["scheme:"+scheme] = ["current":path(workspace.urlForApplication(toOpen:url)),"candidates":workspace.urlsForApplications(toOpen:url).map{path($0)}]
}
let report:[String:Any] = ["readOnly":true,"extensions":resolutions,"queries":queries]
print(String(data:try! JSONSerialization.data(withJSONObject:report,options:[.prettyPrinted,.sortedKeys]),encoding:.utf8)!)
