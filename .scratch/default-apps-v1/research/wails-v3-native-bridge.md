# Wails 3.1.0 承载 macOS 默认关联：桥接研究

研究日期：2026-11-05。对应工单：[Wails V3 如何承载 macOS 默认关联能力？](../issues/02-wails-v3-native-bridge.md)。

本文提供选型证据与推荐；原生桥接和服务边界仍由[首版采用哪条原生桥接路线与服务边界？](../issues/06-architecture-boundary.md)决定。没有编写桥接、构建新产品、运行产品测试或更改默认关联。

## 结论

当前项目最省新增机制的候选路线是 **Go 服务 + 薄 cgo / Objective-C 适配器 + macOS 公共 NSWorkspace / UTType API**。Wails 3.1.0 的默认 macOS 后端本来就使用 cgo，现有构建任务已打开 cgo；Objective-C 可以直接接收 Apple 的 block completion，再用数值请求 ID 把结果交回 Go。无需修改 Wails 内部实现或增添第二个可执行程序。这是基于源码的工程推荐，尚未做原生操作验证，也未锁定选型。[Wails 默认后端][w-cgo]、[Go 的 Objective-C 源文件支持][g-files]、[本地 Darwin 任务][l-darwin]

另两条路线也有真实可行的基础：Swift helper 能直接使用 Apple 的 Swift API，但要补进程协议、生命周期与双份构建打包；purego 0.11.1 已支持 Objective-C message 与 block，但要自行承担动态 ABI、对象和 block 生命周期，不能把 Wails 内部的 Cocoa 辅助函数当成公开 SDK。选用 purego 调用 macOS 与选用 Wails 的实验性 purego GUI 后端是两件可独立判断的事。[Apple setter][a-type]、[Go os/exec][g-exec]、[purego objc][p-objc]、[purego block][p-block]、[Wails Cocoa 内部辅助层][w-cocoa]

兼容版本有一个必须明确的事实：现代 setter 的 API 下限是 **macOS 12**，但本机实际使用的 **Go 1.27.3 下限是 macOS 13**。Taskfile 和 Info.plist 的 12.0 不能降低 Go runtime 要求。若后续要承诺 macOS 12，需要固定 Go 1.26 并验证；仅自用则可在后续决策中承诺当前机器，或选择与现有 toolchain 相符的 macOS 13+ 范围。[Apple setter availability][a-type]、[Go 1.26 Darwin][g-126]、[Go 1.27 Darwin][g-127]、[本地声明][l-go]、[本地 Info.plist][l-plist]

## 证据范围与版本核实

| 项目 | 本次读取结果 | 依据 |
| --- | --- | --- |
| 项目 Go 依赖 | `github.com/wailsapp/wails/v3 v3.1.0`；`go 1.26.0`；purego `v0.11.1` 为间接依赖 | [go.mod][l-go] |
| Wails CLI | 只读执行 `wails3 version` 返回 `v3.1.0` | 本机命令结果 |
| 前端 runtime | package.json 指定 `@wailsio/runtime: 3.1.0`；已安装包也为 3.1.0 | [frontend/package.json][l-front]、[已安装 package.json][l-runtime] |
| 实际 Go | `go env GOVERSION GOOS GOARCH CGO_ENABLED` 为 `go1.27.3 / darwin / arm64 / 1` | 本机命令结果；模块语言声明不是 toolchain 上限 |
| 原生工具 | `xcodebuild -version` 为 Xcode 27.0；`xcrun --show-sdk-path` 指向 CLT macOS SDK；`xcrun swiftc --version` 为 Apple Swift 6.4，target `arm64-apple-macosx27.2.0` | 本机工具自身输出 |
| 官方版本对应 | 官方 `v3.1.0` tag 于 2026-11-01 发布，指向 commit `4b454e443f6f11ccb64679c5c3d3f3bf5e6fb440` | [官方 tag 对象][w-tag] |
| 本地模块源码 | 位于 `/Users/sunven/go/pkg/mod/github.com/wailsapp/wails/v3@v3.1.0`；其 `mainthread_darwin.go` 与官方 tag 下载内容逐字节相同 | [官方同版本文件][w-main-cgo]；SHA-256 `547558a1b90588f2d2b02328e4b0c4dc645fc1a22c0e905ec611b5783afdbb68` |

Wails 模块自身声明 `go 1.26.0`、`toolchain go1.26.10`。同一 tag 的 V3 安装文档列出 macOS AMD64/ARM64、Go 1.26+、Xcode Command Line Tools，并特别区分标准任务的 macOS 12.0 部署目标与所有自定义构建的支持承诺。[Wails go.mod][w-go]、[同版本 V3 安装文档][w-install]

`https://v3.wails.io/` 在此次读取返回 HTTP 403，因此文档引用使用 **同一个 v3.1.0 tag 内的 `docs/mpress/content/` V3 原始 Markdown**，并以该 tag 的实际源码交叉核对。没有采用仓库 `website/` 中的 V2 文档，也没有套用网上旧 alpha 示例。文档中的简单 `Promise` 示例，以实际生成的 `CancellablePromise`、运行时代码和 Go 源码为准。[V3 method 文档][w-methods]、[项目生成绑定][l-binding]、[runtime calls.ts][w-calls]

## 需要调用的原生表面

桥接方式与默认关联 API 的选择应分开讨论。当前 Apple 公共接口已经同时提供 Objective-C 与 Swift 表面：

| 能力 | 公共 Objective-C 表面 | availability / 结果 |
| --- | --- | --- |
| 按类型读取默认应用 | `URLForApplicationToOpenContentType:` | macOS 12；返回 `NSURL *` 或 nil |
| 按类型读取候选 | `URLsForApplicationsToOpenContentType:` | macOS 12；返回应用 URL 数组，可能为空 |
| 修改类型默认应用 | `setDefaultApplicationAtURL:toOpenContentType:completionHandler:` | macOS 12；`UTType *` + 应用 `NSURL *`；异步 `NSError *` completion |
| 按 URL 读取默认应用 / 候选 | `URLForApplicationToOpenURL:` / `URLsForApplicationsToOpenURL:` | 分别从 10.6 / 12；针对实际 URL；文件 URL 的不存在路径可能返回 nil / 空数组 |
| 修改协议默认应用 | `setDefaultApplicationAtURL:toOpenURLsWithScheme:completionHandler:` | macOS 12；scheme 字符串 + 应用 URL；异步 completion |
| 根据 bundle ID 找到应用副本 | `URLForApplicationWithBundleIdentifier:` / `URLsForApplicationsWithBundleIdentifier:` | 单个结果从 10.6，多个结果从 12；多个副本按系统适合启动程度排序 |
| 应用 / 类型图标 | `iconForFile:` / `iconForContentType:` | 应用包路径可使用文件图标；类型图标 API 从 11 |

表中声明、可空结果和排序规则来自 [Apple 本地 SDK `NSWorkspace.h`][a-header]；现代 setter 的 macOS 12 下限及 consent 语义也由 [Apple 类型 setter 文档][a-type]、[Apple scheme setter 文档][a-scheme]明确说明。两份文档还列出 Swift completion 与 `async throws` 表面。

部分类型 / scheme 更改要求用户同意，系统会异步请求同意，**在完成确认后才调用 completion**。因此桥接返回“已发起”不能证明默认已生效，也不能承诺每次修改都静默完成。具体能力、角色和目录完整性仍以关联 API 研究及产品目录决策为准。[Apple 类型 setter][a-type]、[Apple scheme setter][a-scheme]

Wails 的 `Options.FileAssociations`、构建配置 `fileAssociations` 和文件关联示例处理的是应用自身声明/接收文件打开事件；源码搜索未发现可供本产品直接复用的默认关联服务或 NSWorkspace setter。需要产品自己的 macOS 适配器。[Options 源码][w-options]、[自身文件关联示例][w-file-example]

## 三条桥接路线比较

| 路线 | 已有可行基础 | 本项目新增代价 | 适用判断 |
| --- | --- | --- | --- |
| Go/cgo + Objective-C | Go 支持 `.m` 原生源文件；Wails 默认后端和 notifications service 已使用 Objective-C、block、C 到 Go callback | 小型 Darwin package、C ABI、对象内存与请求 registry；需要保持 cgo 构建 | **推荐候选首选**：复用现有工具链与同一 AppKit 进程，新增机制最少 |
| Swift helper，Go 启动子进程 | Apple 的 Swift API 和本机 Swift compiler 都存在；Go `os/exec` 提供进程与 pipes | 第二份 target/架构构建、JSON 请求响应协议、退出/超时处理、主事件循环、dev 与 package 两套复制和签名；需要验证系统确认的进程归属 | 若后续原生范围扩大或明确偏好 Swift，可保留；本轮证据不足以说 helper 更简单 |
| Go + purego/objc | 项目已经下载 purego 0.11.1；支持 Dlopen、C symbols、Objective-C selectors、Go-backed blocks；Wails 自己已有此实现 | 自建带类型的 Cocoa 封装、selector/ABI 检查、retain/release/autorelease pool 和 block 生存期；较少编译器静态检查 | 技术可行候选；若只是单机 macOS，移除产品 `.m` 的收益有限；全 GUI purego 后端还要接受实验状态 |

比较的依据分别是 [Go file types][g-files]、[Wails notifications cgo][w-notify-cgo]、[Go os/exec][g-exec]、[Apple setter 的 Swift 声明][a-type]、[purego RegisterFunc][p-func]、[purego objc][p-objc]与 [block API][p-block]。代价和优先顺序为本研究的工程判断。

### cgo / Objective-C

可把原生代码放在一个 Darwin package：Go 面仅暴露 C 能理解的字符串、字节长度、整数请求 ID 与简单结果；`.m` 面负责 UTType / NSURL / NSArray / NSError 转换及 block。Go 原生文件分类明确把 `.m` 当 Objective-C，并由原生编译器处理；cgo flags 可指定框架链接。Wails notifications 的同版本实现就是原生异步 API → C/Go callback → Go channel 的可参考案例，但它的固定五秒超时不能直接成为需要用户确认的默认关联操作规则。[Go file types][g-files]、[cgo 文档][g-cgo]、[notifications cgo 源码][w-notify-cgo]

异步回调若保存 Go 状态，使用请求数字 ID / registry 或 `runtime/cgo.Handle`，不要让 ObjC block 保存指向普通 Go channel、闭包或 Go string 的指针。Handle 本身是整数，只有确认 C 不再持有它时才 Delete；超时后立刻 Delete、然后晚到 callback 仍访问它会出错。ObjC 端需要明确输入复制、对象/block ownership、autorelease pool 与输出释放责任。[cgo pointer rules][g-cgo]、[runtime/cgo.Handle][g-handle]、[Apple autorelease / thread 指导][a-threads]

使用 `//export` 的 Go 文件，其 cgo preamble 应仅放声明；函数定义放 `.m` 或不含 export 的独立桥接文件，避免 preamble 被复制后产生重复定义。[cgo C references to Go][g-cgo]

### Swift helper

这里比较的是 **应用包内独立可执行工具**，Go 通过参数或 stdin/stdout JSON 调用；不是通过 cgo 直接绑定 Swift ABI。Apple setter 已提供 Swift `async throws`，本机 `swiftc -help` 提供 `-emit-executable`、`-sdk`、`-target` 等参数；技术上可编译本地 helper，再由 Go `os/exec` 等待结果。[Apple Swift setter][a-type]、[Go os/exec][g-exec]；编译参数由本机工具帮助核实。

helper 必须在 completion 返回前保持存活，并明确 AppKit/主事件循环策略。Apple 指导说明 Foundation-only 应用不会自动运行主 run loop；“发起 setter 后直接返回 main”不构成可靠异步生命周期设计。当前官方 setter 文档没有解释 helper 的系统确认窗口归属、激活行为或父进程退出的效果，这些是若考虑该路线需要受控验证的精确问题。[Apple run loop 指导][a-threads]、[Apple consent 语义][a-type]

`exec.CommandContext` 默认在 context 结束时杀子进程；杀 helper 不构成对 macOS 已提交设置的撤销。宜定义请求 ID、协议版本、独立 stdout 协议/stderr 日志、exit status 与结果状态；具体是否使用一次一进程或常驻进程仍是架构决策。[Go CommandContext / pipes][g-exec]、[setter 没有撤销语义的公开签名][a-type]

Apple 应用包规范允许 `Contents/MacOS` 包含额外 command-line executables。现有任务仅复制主程序，helper 必须加入普通包和 `.dev.app` 的复制路径，并在签名之前放入；若选择 universal，helper 也要有对应架构或 universal 版本。当前任务没有 Swift 编译步骤，Wails 不会替产品自动生成此 helper。[Apple bundle 结构][a-bundles]、[本地 Darwin 任务][l-darwin]

### purego

purego 0.11.1 将 macOS amd64/arm64 列为 Tier 1；其 `objc.ID.Send` / `objc.Send` 调用 selectors，`objc.NewBlock` 让 Objective-C 调用 Go 函数，返回 block 需要 Release。Wails notifications purego 实现已有异步 block 示例，说明 completion 不要求 cgo 才能承载。[purego README][p-readme]、[objc API][p-objc]、[block API][p-block]、[notifications purego 源码][w-notify-purego]

但 purego 文档明确：无法验证 Go 函数签名是否匹配 native symbol，也不保证所有 native/Go 对象生命周期或 struct padding。ObjC package 自述是容易用错的低层 API，应有更安全的 wrapper。需要同时考虑 amd64/arm64 ABI、nullable 对象、错误和 block ownership；应从当前 SDK 定义调用，不复制旧 alpha 的裸 `objc_msgSend` 示例。[purego RegisterFunc][p-func]、[objc package 警告][p-objc]

Wails 的 `class` / `get` / `nsString` / `withAutoreleasePool` 位于 `pkg/application`，但名称均未导出，且文件以 `darwin && purego` 构建条件选择。产品可使用公开 purego 依赖自建少量 wrapper，不能依赖这些私有函数或为了获取它们而 fork 框架。[Wails Cocoa 辅助层][w-cocoa]

**直接 purego 调用可与默认 cgo Wails 后端共存**：两个包使用各自机制，Wails 本身已把 purego 列作依赖。若要整款应用 `CGO_ENABLED=0`，才需 `purego` build tag / `WAILS_PUREGO=1`；同版本 buildguard 和 CLI 明确把该后端标为 experimental。只设 `CGO_ENABLED=0` 而不设 tag 不构成支持的默认 macOS 构建。[Wails go.mod][w-go]、[CLI tag 选择][w-task-wrapper]、[buildguard][w-buildguard]

## 主线程、回调和异步服务

Wails 3.1.0 公开 `application.InvokeSync`、`InvokeAsync` 及结果/错误变体；桌面初始化 `runtime.LockOSThread()`，主 goroutine 最后进入平台 AppKit run loop。普通 runtime/asset 请求则在 Go goroutine 中处理，不能假设绑定服务方法天然位于 AppKit 主线程。[mainthread.go][w-main]、[init_desktop.go][w-init]、[App.Run][w-app]、[异步 WebView 请求处理][w-requests]

当前 macOS cgo 与 purego dispatch 都使用 **`CFRunLoopPerformBlock` + common modes + wakeup**。源码说明它选择 run loop 是为了让工作在菜单跟踪或模态嵌套 run loop 中也能递送，避免只靠 main dispatch queue 导致后续工作等模态关闭。产品应复用公开 `Invoke*`，不在桥接里另建 Wails 主循环。[cgo dispatch][w-main-cgo]、[purego dispatch][w-main-purego]

`InvokeAsync` 只保证从非主线程调度；若调用者已在主线程，Wails 会直接执行闭包。因此里面只放短小的原生调用发起/转换，不能阻塞等待同一主线程才能完成的 callback。`InvokeSync` 在 `App.Run` 之前会排队后等待；若占住随后要调用 Run 的 goroutine，就无法继续启动。ServiceStartup 在桌面也是启动流程的主 goroutine，原生异步修改不适合在该钩子中发起并等完成。[App dispatch / startup 源码][w-app]、[mainthread 公共实现][w-main]

Apple setter 文档只保证 operation/consent 完成后通知，**未承诺 callback 所在线程**。不要把其他 NSWorkspace `open...` 方法的 concurrent queue 注释外推为 setter 的确定规则。建议把 callback 当可能来自任意原生线程：立即复制 NSError/结果为 Go 可拥有的数据，以线程安全 registry/缓冲结果通道交还等待者；再次触及 UI/AppKit 时重新调度。将 setter 的发起统一安排在 Wails 主线程是本研究的保守选择，并非声称 Apple 文档强制所有 NSWorkspace 方法都必须主线程。[当前 setter 文档][a-type]、[不同方法的 SDK 注释][a-header]、[Apple 通用线程指导][a-threads]

绑定承载的候选流程：

1. 前端调用生成的 `CancellablePromise<结果>`；Go 服务方法采用 `context.Context` 首参及 `(结果, error)`，原生对象不暴露给 JS。
2. Go 服务登记请求 ID，再通过 `InvokeAsync` 或短小 `InvokeSync` 发起原生 setter。
3. 原生 block 只完成结果转换/通知；等待发生在调用该服务的 Go goroutine，AppKit 主线程持续运行。
4. 服务等 completion，随后独立查询当前默认值，将 native completion 与观察值都纳入结果；最终状态命名由修改语义工单决定。

Wails 的服务是按 Go type 注册的共享实例；导出方法生成 bindings，首参 context 在 runtime 注入，`error` 使 promise reject。可以用 ServiceOptions.MarshalError 或导出字段的自定义 error 保留 `NSError` domain/code/message 与操作上下文；channel、函数和 native handles 留在 Go/macOS 层。[services.go][w-services]、[bindings.go][w-bindings]、[service 文档][w-service-doc]、[method 文档][w-methods]、[项目生成绑定][l-binding]

runtime cancellation 会按 call ID 请求取消 Go context；Go 必须实际 select/检查 context 才停止工作。Apple setter 没有公开 cancel/rollback 参数，因此 `promise.cancel()`、窗口关闭或 Go 等待超时，都不能被描述为“已恢复原默认”。晚到 callback 必须可以安全落地，且后续能重新查询；需要用户确认的操作也不能照搬短小固定超时。[runtime cancellation][w-calls]、[Go call context][w-process-call]、[Apple setter 签名][a-type]。推荐每个修改操作以 registry 管理存活，而非把 promise 生命周期直接当作 native 操作生命周期。

## 图标与资产传递

应用图标宜按系统确认的应用包 URL 读取 `NSWorkspace.iconForFile:`，类型图标读取 `iconForContentType:`。`iconForFile:` 文档明确可从任意线程调用，返回 NSImage 初始尺寸 32×32；这不意味着任意 NSImage 操作都线程安全。Apple 通用指南把 NSImage 视为通常不线程安全，允许独占线程创建/绘制后交接。[Apple file icon][a-icon-file]、[Apple type icon][a-icon-type]、[Apple NSImage 线程限制][a-threads]

可在受控线程/池中把 NSImage 渲染或取 CGImage，转 NSBitmapImageRep，再用 PNG representation 输出 Data；显式选择像素尺寸，才能为前端的实际尺寸和 Retina 提供资产，不能假定 NSImage 的 size 就是所需像素大小。[NSImage → CGImage][a-cgimage]、[NSBitmapImageRep encoding][a-bitmap]

Wails 两种传递方式已有支持：

- 小量图标：绑定返回 `[]byte`，Go JSON 规则使其 base64 字符串，前端构造 PNG data URL。接入简单；长列表会扩大 JSON 结果和重复复制。
- 图标服务路由：Go service 实现 `http.Handler`，使用 `NewServiceWithOptions(... Route: "/icons/")`，把 PNG 字节作为 `image/png` 响应；主 DTO 只含图标 ID / URL。现有 asset server 会在静态 handler 前匹配服务路由，剥掉 route prefix。宜用同源相对 URL、受控图标 ID 和缓存，而不是让前端把磁盘路径直接拼成资源地址。[V3 method 类型映射][w-methods]、[service Route][w-services]、[asset route 源码][w-assets]

第二种更适合本产品可能出现的应用/类型长列表，是工程推荐。缓存键至少应区分应用副本和请求像素尺寸；失效策略由刷新规格决定。产品图标服务与 `wails3 generate icons` 分工不同：后者从 `build/appicon.png` 生成本工具自己的 `.icns/.ico/Assets.car`，不枚举已安装应用图标。[本地 icon task][l-common]

## 现有 Darwin 任务能支持到哪里

现有 `build/darwin/Taskfile.yml` 提供 native build、amd64/arm64 双架构 build + lipo、普通 `.app` 与 universal `.app` package、`.dev.app`、ad-hoc 签名。native task 设置 GOOS/GOARCH、默认 CGO_ENABLED=1，以及三个 12.0 deployment 设置。[本地 Darwin 任务][l-darwin]

对 cgo 候选路线而言，Go package 内 `.m/.h` 会进入正常 Go 原生编译缓存，框架 flags 由该 package 声明；现有 native/每架构构建路径可以承载该结构，无需外部 helper copy 步骤。这里验证的是构建脚本与 Go 工具的结构，**不是已编译并运行新桥接的结论**。[Go file types][g-files]、[cgo 文档][g-cgo]、[本地 task][l-darwin]

对 purego 全 GUI 路线，现有 task 在 EXTRA_TAGS 含 purego 时设 CGO_ENABLED=0，并走 native build；CLI 也会把 WAILS_PUREGO 环境选择转换成 tag。自定义适配器必须与选定 build tags 一起处理，不应自动承诺两套后端都支持。[本地 task][l-darwin]、[CLI wrapper][w-task-wrapper]

对 Swift helper，必须新增 Swift build、每架构输出/universal 合并、两个 bundle 路径的复制、helper 路径解析、签名顺序和生命周期。现有 `create:app:bundle` 与 `run` 都会先重建 bundle，仅临时手放 helper 进 bin 或旧 `.app` 会在下一次打包丢失。[本地 task][l-darwin]、[Apple bundle 结构][a-bundles]

开发监听也是一个具体差异：现有 `build/config.yml` 只列 `*.go`、`*.js`、`*.ts`，未列 `.m/.h/.swift`。选中任何含这类源文件的路线后，需要把它们加入 watch 并安排对应 rebuild；直接 `go build` 能检测包内 native source，不代表当前 `wails3 dev` 会因这些文件变化自动启动它。[本地 dev 配置][l-config]、[Go cgo source/cache 规则][g-cgo]

AMD64/ARM64 是 Wails 同版本安装文档列出的平台，也是现有 universal 任务和 purego Tier 1 对应的架构。当前机器只有 arm64，本轮没有测试 Intel 或较旧 macOS；可以把单架构自用作为后续明确选项，但不要把提供了 universal task 等同于已经验收 universal 产品。[Wails 安装][w-install]、[purego Tier 1][p-readme]、[本地 task][l-darwin]

## 后续要明确的问题

以下产品/架构问题已有工单承接，无需重复创建：

- 支持当前自用机器、macOS 13+，还是固定 Go 1.26 支持 macOS 12；仅 arm64 还是也交付 amd64/universal；桥接与服务边界。交给[首版采用哪条原生桥接路线与服务边界？](../issues/06-architecture-boundary.md)。
- completion、取消等待、native error 与回读不一致如何表达；同一关联的并发写入、部分结果和刷新时机。交给[修改默认关联时，用户如何确认结果与处理失败？](../issues/05-change-semantics-prototype.md)，本文仅说明技术事实。

若后续决策要求超出文档能保证的本机行为，可以新建以下精确 **受控验证 task**，而不是继续猜测：

1. **“Wails 中的原生确认、晚到回调与回读如何实际表现？”** 在指定隔离/可恢复测试环境和测试关联后，核对当前 `.app` 中 setter 的 callback 线程、需要确认时的 UI 响应、确认结束到可观测默认值更新的时机、Go 等待取消后的晚到 callback，以及应用退出对待决请求的效果。验证结果用于补充修改语义与验收，不能仅凭一项即时读回就声称所有系统相同。
2. **“Swift helper 能否可靠呈现默认关联系统确认？”** 仅当 helper 成为真正候选时才开：核对无主窗口 helper 的 run loop/activation 要求、确认窗口的进程/应用归属、父子退出与 completion。当前文档证明 API 可调用，没有证明这个具体包装的用户体验。

如果最终选择 cgo，purego ABI 或 Swift helper 生命周期不是首版开工前必须调查的事项。实际系统确认是否出现、具体错误码、可见生效时机和旧系统行为仍是本研究的证据边界。

## 来源

所有远端来源均为 Apple、Go、Wails 或 purego 项目自身的文档/源码。Wails 链接固定在 v3.1.0；Apple 文档为此次读取的当前版本，通用线程与 bundle 指导为 Apple 官方归档；本地 SDK 与工具输出补充精确声明及当前机器条件。

[w-tag]: https://api.github.com/repos/wailsapp/wails/git/tags/2bc34478ae74040b7f5233c7e45cd8bf42984ef9
[w-go]: https://github.com/wailsapp/wails/blob/v3.1.0/v3/go.mod
[w-install]: https://github.com/wailsapp/wails/blob/v3.1.0/docs/mpress/content/getting-started/installation.md
[w-service-doc]: https://github.com/wailsapp/wails/blob/v3.1.0/docs/mpress/content/features/bindings/services.md
[w-methods]: https://github.com/wailsapp/wails/blob/v3.1.0/docs/mpress/content/features/bindings/methods.md
[w-services]: https://github.com/wailsapp/wails/blob/v3.1.0/v3/pkg/application/services.go
[w-bindings]: https://github.com/wailsapp/wails/blob/v3.1.0/v3/pkg/application/bindings.go
[w-process-call]: https://github.com/wailsapp/wails/blob/v3.1.0/v3/pkg/application/messageprocessor_call.go
[w-calls]: https://github.com/wailsapp/wails/blob/v3.1.0/v3/internal/runtime/desktop/@wailsio/runtime/src/calls.ts
[w-main]: https://github.com/wailsapp/wails/blob/v3.1.0/v3/pkg/application/mainthread.go
[w-main-cgo]: https://github.com/wailsapp/wails/blob/v3.1.0/v3/pkg/application/mainthread_darwin.go
[w-main-purego]: https://github.com/wailsapp/wails/blob/v3.1.0/v3/pkg/application/mainthread_darwin_purego.go
[w-init]: https://github.com/wailsapp/wails/blob/v3.1.0/v3/pkg/application/init_desktop.go
[w-app]: https://github.com/wailsapp/wails/blob/v3.1.0/v3/pkg/application/application.go
[w-cgo]: https://github.com/wailsapp/wails/blob/v3.1.0/v3/pkg/application/application_darwin.go
[w-requests]: https://github.com/wailsapp/wails/blob/v3.1.0/v3/internal/assetserver/assetserver_webview.go
[w-assets]: https://github.com/wailsapp/wails/blob/v3.1.0/v3/internal/assetserver/assetserver.go
[w-cocoa]: https://github.com/wailsapp/wails/blob/v3.1.0/v3/pkg/application/darwin_purego_cocoa.go
[w-notify-cgo]: https://github.com/wailsapp/wails/blob/v3.1.0/v3/pkg/services/notifications/notifications_darwin.go
[w-notify-purego]: https://github.com/wailsapp/wails/blob/v3.1.0/v3/pkg/services/notifications/notifications_darwin_purego.go
[w-options]: https://github.com/wailsapp/wails/blob/v3.1.0/v3/pkg/application/application_options.go
[w-file-example]: https://github.com/wailsapp/wails/blob/v3.1.0/v3/examples/file-association/main.go
[w-task-wrapper]: https://github.com/wailsapp/wails/blob/v3.1.0/v3/internal/commands/task_wrapper.go
[w-buildguard]: https://github.com/wailsapp/wails/blob/v3.1.0/v3/internal/buildguard/doc.go
[p-readme]: https://github.com/ebitengine/purego/blob/v0.11.1/README.md
[p-objc]: https://github.com/ebitengine/purego/blob/v0.11.1/objc/objc_runtime_darwin.go
[p-block]: https://github.com/ebitengine/purego/blob/v0.11.1/objc/objc_block_darwin.go
[p-func]: https://github.com/ebitengine/purego/blob/v0.11.1/func.go
[g-cgo]: https://pkg.go.dev/cmd/cgo
[g-files]: https://github.com/golang/go/blob/go1.27.3/src/cmd/go/alldocs.go
[g-handle]: https://pkg.go.dev/runtime/cgo#Handle
[g-exec]: https://pkg.go.dev/os/exec
[g-126]: https://go.dev/doc/go1.26#darwin
[g-127]: https://go.dev/doc/go1.27#darwin
[a-type]: https://developer.apple.com/documentation/appkit/nsworkspace/setdefaultapplication(at:toopen:completion:)
[a-scheme]: https://developer.apple.com/documentation/appkit/nsworkspace/setdefaultapplication(at:toopenurlswithscheme:completion:)
[a-icon-file]: https://developer.apple.com/documentation/appkit/nsworkspace/icon(forfile:)
[a-icon-type]: https://developer.apple.com/documentation/appkit/nsworkspace/icon(for:)
[a-cgimage]: https://developer.apple.com/documentation/appkit/nsimage/cgimage(forproposedrect:context:hints:)
[a-bitmap]: https://developer.apple.com/documentation/appkit/nsbitmapimagerep/representation(using:properties:)
[a-threads]: https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/Multithreading/ThreadSafetySummary/ThreadSafetySummary.html
[a-bundles]: https://developer.apple.com/library/archive/documentation/CoreFoundation/Conceptual/CFBundles/BundleTypes/BundleTypes.html
[a-header]: /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/System/Library/Frameworks/AppKit.framework/Headers/NSWorkspace.h
[l-go]: ../../../go.mod
[l-front]: ../../../frontend/package.json
[l-runtime]: ../../../frontend/node_modules/@wailsio/runtime/package.json
[l-binding]: ../../../frontend/bindings/changeme/greetservice.ts
[l-darwin]: ../../../build/darwin/Taskfile.yml
[l-common]: ../../../build/Taskfile.yml
[l-config]: ../../../build/config.yml
[l-plist]: ../../../build/darwin/Info.plist
