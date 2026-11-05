# macOS 默认关联接口调查

调查日期：2026-11-05。环境：macOS 27.2 / arm64，Command Line Tools 的当前 macOS SDK。本文支持产品决策；没有调用任何默认关联 setter。

## 有证据的能力边界

| 目标 | 公开接口 | 边界 |
| --- | --- | --- |
| 查询文件类型默认应用 | `NSWorkspace.URLForApplicationToOpenContentType:` | 接受 UTType，可能返回 nil；没有 Viewer/Editor 参数。 |
| 查询文件类型候选应用 | `URLsForApplicationsToOpenContentType:` | 返回按系统适用性排序的应用 URL；数组首项称为 best match，默认状态应独立读取。 |
| 查询协议默认与候选 | `URLForApplicationToOpenURL:` / `URLsForApplicationsToOpenURL:` | 对非文件 URL 可按 scheme 查询；不需要实际访问这个 URL。 |
| 修改文件类型默认应用 | `setDefaultApplicationAtURL:toOpenContentType:completionHandler:` | 异步；部分类型需系统用户同意后才触发完成回调。 |
| 修改协议默认应用 | `setDefaultApplicationAtURL:toOpenURLsWithScheme:completionHandler:` | 异步；部分协议需系统用户同意；公开头文件没有列出完整受保护协议清单。 |
| 查询同一应用的安装副本 | `URLsForApplicationsWithBundleIdentifier:` | 返回应用 URL 数组，bundle ID 本身不足以定位一个安装副本。 |
| 查询实际文件的打开应用 | `URLForApplicationToOpenURL:` | 文件必须存在；它回答具体文件的打开行为，不能用不存在的虚构文件查询类型默认值。 |

上述新候选和修改接口标注 macOS 12.0 可用。依据：[Apple NSWorkspace 文档](https://developer.apple.com/documentation/appkit/nsworkspace)；本机 [NSWorkspace.h](/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/System/Library/Frameworks/AppKit.framework/Headers/NSWorkspace.h:111)，查询与 setter 在 120–141 行，系统同意规则写在相应声明注释中。

同一头文件还提供“某个文件”与“某个文件类型”的不同 setter；前者要求对目标文件有写权限。规格应明确操作的是类型默认值，具体文件的既有设置需独立考虑，不能把两种范围混为一谈。[NSWorkspace.h](/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/System/Library/Frameworks/AppKit.framework/Headers/NSWorkspace.h:131)

## 文件类型、扩展名与 MIME

UTType 有稳定的类型标识、多个扩展名/MIME 标签和类型继承关系。`typesWithTag:tagClass:conformingToType:` 可返回多个类型；有效但未知的标签可能得到动态类型。`typeWithIdentifier:` 对系统未知标识可能返回 nil；允许未声明标识的新重载是 macOS 27.0 才提供的能力。Apple 明确提示不要仅用路径扩展名推断实际文件类型。[UTType 文档](https://developer.apple.com/documentation/uniformtypeidentifiers/uttype)、[UTType.h](/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/System/Library/Frameworks/UniformTypeIdentifiers.framework/Headers/UTType.h:33)、[标签查询声明](/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/System/Library/Frameworks/UniformTypeIdentifiers.framework/Headers/UTType.h:308)

所以：扩展名适合搜索和显示，但不宜作为关联项的唯一身份；MIME 标签也不等于独立的默认应用设置。继承关系意味着某个应用可能能够处理并未逐项列在自身声明中的子类型；应用声明与系统当前可用候选要分开表达。[类型继承声明](/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/System/Library/Frameworks/UniformTypeIdentifiers.framework/Headers/UTType.h:260)

## 声明、候选、当前默认

应用的 `Info.plist` 可以包含 `CFBundleDocumentTypes`、`LSItemContentTypes`、历史扩展名/MIME 字段、`CFBundleTypeRole`，以及 `CFBundleURLTypes` / `CFBundleURLSchemes`。它们描述应用声明，并非用户的当前默认设置。[CFBundleDocumentTypes](https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundledocumenttypes)、[CFBundleURLTypes](https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleurltypes)、[Apple Launch Services 概念](https://developer.apple.com/library/archive/documentation/Carbon/Conceptual/LaunchServicesConcepts/LSCConcepts/LSCConcepts.html)

本机只读检查 `/System/Applications/Preview.app/Contents/Info.plist` 可见 Preview 声明 PDF、JPEG 等内容；`/System/Applications/Mail.app/Contents/Info.plist` 声明 mailto、message 等协议。默认应用仍须通过系统查询，不能从这些声明或 `LSIsAppleDefaultForType` 推断。

所调查的 NSWorkspace 接口按类型、URL 或 bundle ID 查询，未提供“一次列出全系统所有关联及所有已安装应用”的完整目录接口。首版目录需要组合明确来源，例如常见类型、可发现应用声明与用户输入，并写清扫描范围及未知项的处理。标准应用目录扫描也不能代替系统候选查询，因为候选可能来自其他安装位置；目录覆盖率与默认查询准确性是两个不同问题。

## 旧 Launch Services 接口

旧 `LSCopyDefaultRoleHandlerForContentType` / `LSCopyAllRoleHandlersForContentType` / `LSSetDefaultRoleHandlerForContentType` 使用类型标识、bundle ID 和 role mask；Editor、Viewer、All 是不同参数语义。当前头文件把它们标为弃用并指向 NSWorkspace 替代接口；NSWorkspace 新接口没有 role 参数，不能未经验证就承诺“独立设置或覆盖全部角色”。旧 URL scheme getter 明确自 macOS 10.15 弃用，setter 同样指向异步 NSWorkspace 替代接口。[LSInfo.h](/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Headers/LSInfo.h:274)

优先考虑现代公开接口；保留旧接口的任何需求应由后续架构决策说明理由，而不是沿用历史 Default Apps 面板的内部模型。

## 本机只读验证

运行 `xcrun swift -`，导入 AppKit / UniformTypeIdentifiers，使用 `UTType.types(tag:tagClass:conformingTo:)`、`NSWorkspace.shared.urlForApplication(toOpen:)` 和 `urlsForApplications(toOpen:)`。没有打开链接或文件，没有设置默认应用。

| 输入 | 返回类型 / 当前默认 | 对规格的影响 |
| --- | --- | --- |
| jpg | `public.jpeg` / Preview；`com.microsoft.ppt.export.ext.jpg` / Safari | 同一个扩展名确实可对应多个类型和不同默认值。 |
| jpeg | `public.jpeg`，标签含 jpeg/jpg/jpe，默认 Preview | 多个扩展名也可指向同一个类型。 |
| pdf | `com.adobe.pdf`，默认 Google Chrome | Preview 支持 PDF 并不意味着它当前默认。 |
| mailto | 默认 Mail；候选还包括企业微信 | 系统候选与默认需分别读取。 |
| http / https | 默认 Google Chrome；候选包含 Chrome for Testing | 不能把“标准应用目录扫描结果”当成完整候选列表。 |

这些是当前机器的观察，不是跨版本保证。应用安装情况和默认值会改变；产品验收应读取现场状态。

复现的核心代码：

```swift
import AppKit
import UniformTypeIdentifiers
let ws = NSWorkspace.shared
for type in UTType.types(tag: "jpg", tagClass: .filenameExtension, conformingTo: nil) {
    print(type.identifier, type.tags)
    print(ws.urlForApplication(toOpen: type) as Any)
    print(ws.urlsForApplications(toOpen: type))
}
let url = URL(string: "mailto:example")!
print(ws.urlForApplication(toOpen: url) as Any)
print(ws.urlsForApplications(toOpen: url))
```

## 推荐与尚待决定/验证

- 首版按文件类型标识或 URL scheme 识别关联项，扩展名/MIME 作为标签；候选与当前默认分别查询。产品目录来源、未知类型、重复副本和高级选择交给关联目录工单决定。
- 修改应等待完成回调，呈现错误，再查询默认值。回调、回读和具体文件实际打开结果是不同证据；不保证每个既有文件设置都随类型默认改变。
- 尚未实测任何 setter，故用户取消的错误形态、受保护协议范围、未声明支持应用能否设置、回读的可见时机和跨版本行为仍未确认。需要写入验证时另设明确任务，避免把推断写入验收承诺。
- http 与 https 是两个 scheme；“默认浏览器”是否作为合并操作入口，以及两个修改出现部分成功时的处理，留给修改语义工单。

调查结束不等于产品选型已确定。
