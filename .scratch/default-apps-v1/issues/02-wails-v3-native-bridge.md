# Wails V3 如何承载 macOS 默认关联能力？

Labels: wayfinder:research
Type: research
Status: resolved
Assignee: sunven
Parent: [macOS 默认应用工具：首版规格地图](../map.md)
Blocked by:

## Question

在当前 Wails 3.1.0 + Go + React/TypeScript 项目中，哪些原生桥接路线能可靠调用 macOS 的应用与默认关联接口，并将结果提供给前端？

核实项目依赖、CLI、runtime 与官方 V3 文档/源码的对应关系，不按 V2 或旧预发布 API 推断。比较 Go/cgo + Objective-C、Swift 辅助程序及现有原生调用机制在本项目中的可行性与代价，说明线程/回调约束、异步服务绑定、应用图标传递、构建打包、系统最低版本与架构支持；调查范围只到能够选择技术路线所需的证据，不实施产品桥接。

引用 Wails 官方版本源码与文档、Go/cgo 和 Apple 一手资料。输出有证据的选项与推荐，技术选型仍留给后续决策工单。

## Answer

研究已完成，详细证据、同版本官方源码链接与选项比较见[Wails 3.1.0 承载 macOS 默认关联：桥接研究](../research/wails-v3-native-bridge.md)。研究结束不代表技术选型已锁定；选择仍由[首版采用哪条原生桥接路线与服务边界？](06-architecture-boundary.md)处理。

- 项目依赖、CLI 和前端 runtime 均核实为 3.1.0；读取官方 v3.1.0 tag 与对应本地模块。当前 Wails 默认 Darwin 后端使用 cgo；purego GUI 后端是实验性选择。模块没有默认关联的现成服务。
- 三条路线都有事实基础：推荐优先考虑 Go 服务 + 薄 cgo/Objective-C 适配器，复用当前原生构建与 AppKit 进程；Swift helper 需新增进程协议、run loop、架构构建及 bundle 步骤；现有 purego/objc 支持 selectors 和 blocks，但需自行承担动态 ABI、内存及回调生命周期。使用 purego 调用与切换整个 Wails 后端可以分开决定。
- Wails 公开 InvokeSync/InvokeAsync；当前 macOS dispatch 使用 CFRunLoopPerformBlock/common modes 支持嵌套 run loop。绑定方法在 Go goroutine 中执行，可由主线程短小发起 native setter，再在 Go 层等待 completion；不能在主线程闭包里等待异步完成。Apple 未承诺 setter 的 callback 线程。
- Apple 的类型/scheme setter 从 macOS 12 可用，可能异步请求系统确认，确认结束后才 completion。Wails promise/context 取消只影响 Go 等待，不能承诺撤销已经提交的系统设置；需要处理晚到回调并独立回读结果。
- 应用图标可经 NSWorkspace/NSImage 转为 PNG，再走生成绑定的 base64 或 Wails service HTTP Route；长列表优先考虑图标 ID/路由。现有 Darwin 任务能承载 cgo package 与双架构构建结构；Swift helper 需补构建和复制，`.m/.h/.swift` 需补开发监听。
- 实际 toolchain 是 Go 1.27.3，官方最低 macOS 13；Taskfile/Info.plist 的 12.0 不能降低 runtime 要求。若要支持 macOS 12，应固定 Go 1.26 并验证；芯片与系统支持范围留在架构工单决定。

新暴露的受控验证问题：需要系统确认时的窗口响应、callback 线程、确认完成至读回可见的时机、取消等待后的晚到 callback；若 Swift helper 成为候选，还需验证其确认窗口归属与父子进程生命周期。具体 task 建议已写入研究记录，当前未执行真实设置操作。

仅修改本研究文件和本工单；未修改产品文件、初始化 Git、推送或运行产品测试。
