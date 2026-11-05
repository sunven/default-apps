import AppKit
import UniformTypeIdentifiers
let ws=NSWorkspace.shared
let current=ws.urlForApplication(toOpen:.pdf)
let candidates=ws.urlsForApplications(toOpen:.pdf)
let observation:[String:Any] = ["type":"com.adobe.pdf","current":current?.path as Any? ?? NSNull(),"candidates":candidates.map(\.path),"readOnly":true]
print(String(data:try! JSONSerialization.data(withJSONObject:observation,options:[.prettyPrinted,.sortedKeys]),encoding:.utf8)!)
