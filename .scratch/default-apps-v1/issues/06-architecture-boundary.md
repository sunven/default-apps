# 首版采用哪条原生桥接路线与服务边界？

Labels: wayfinder:grilling
Type: grilling
Status: resolved
Assignee: sunven
Parent: [macOS 默认应用工具：首版规格地图](../map.md)
Blocked by: 01, 02, 03, 05

## Question

前置事实与决策：[macOS 默认关联有哪些可用接口与系统限制？](01-macos-association-api.md)、[Wails V3 如何承载 macOS 默认关联能力？](02-wails-v3-native-bridge.md)、[首版的关联目录与候选应用应如何定义？](03-association-catalog.md)、[修改默认关联时，用户如何确认结果与处理失败？](05-change-semantics-prototype.md)

结合两项技术研究和已确定的目录/修改语义，为 Wails V3 首版选择原生桥接路线，并决定前端、Go 领域服务与 macOS 接口之间的职责边界。

明确关联项和应用身份、查询与修改返回模型、错误与系统确认的处理、刷新策略以及可替换系统适配器的测试边界。决定首版自用所必需的 macOS 版本与芯片支持、构建条件及依赖版本固定策略；避免把脚手架默认值当成产品承诺。仅在符合 domain-modeling 标准的重大权衡上记录 ADR。

## Comments

### 2026-11-05 · 修改语义已定，架构提案可审阅

[首版架构提案](../assets/architecture-proposal.md)整理了服务边界、身份、异步请求、回读、错误、事件同步、刷新、本地状态与退出整合。推荐 Go 服务配薄 cgo／Objective-C 适配器，使用 Wails 公共服务、事件与主线程调度；提交调用只返回受理快照，原生生命周期由 Go 协调器维护。

本机版本与当前源码已只读复核；Wails 有 `ShouldQuit` 和 WindowClosing 的公开取消路径，不能依赖 `app.Run()` 返回后保存。macOS 27.2 / arm64、Go 1.27.3、Wails 3.1.0；构建与 plist 仍为 12，后续实现需与 Go 的 13 下限对齐，兼容验收范围另由用户选择。

待选择的架构根问题：采用推荐的单进程 cgo 路线；首版兼容验收限定当前自用环境还是扩大范围；本地保存手动补充配置并保留单条未定修改记录，还是只保存配置、不保留旧请求。跨启动记录从不自动重放写入，查询到目标也不补写旧 callback 成功。提案待用户 verdict，工单保持 `claimed`。

### 2026-11-05 · 用户接受架构方案，记录决议

用户分别选择「采用提案中的 cgo 路线与服务边界」「先限定当前自用环境」「保存手动补充项和一条未定修改记录」。对应提案已更新为确认后的架构约束，本工单关闭。

## Answer

首版采用**单进程 Go 服务 + 薄 cgo／Objective-C 适配器**，React 经 Wails 生成绑定、类型化事件与快照读取状态；原生接口只使用公共 NSWorkspace／UTType，Wails GUI 保持默认 cgo 后端。完整职责、身份、服务返回与生命周期约束以[已确认的架构方案](../assets/architecture-proposal.md)为准，不在本工单重复其字段和操作协议。

Go 持有修改请求及系统结果／回读，生命周期独立于页面和绑定 promise；一次受理一项修改，待决或回读未确定时暂停新写入，继续查询。前端事件可恢复到快照，旧查询与事件按版本协调；原生 completion 来自任意线程都安全落地，不阻塞 AppKit 主线程，不因等待取消提前删除 callback 登记项。

本地持久化包括手动补充关联、手动应用位置，以及**单条未定修改记录**；不包含数据库、云同步或永久操作历史。提交前先原子保存记录，存储失败就不调用 setter；跨启动只查询当前默认，不重放写入，不把旧 callback 改成成功。用户再次明确修改前看到旧请求可能仍会完成的说明。正常回读完成清除记录；清除失败分别显示已知系统结果与存储问题。详细交互落在桌面工单。

首版验收限定**当前 macOS 27.2 / Apple Silicon 自用环境**。固定 Go 1.27.3、Wails CLI／Go 模块／前端 runtime 3.1.0，前端遵守现有 package-lock，使用 npm ci；部署与链接下限统一为 macOS 13，不承诺已验证全部 13+，不做 Intel／universal 或 macOS 12 兼容。当前脚手架中的部署目标和产品 metadata 留给正式实现更新，本轮不修改构建或依赖。

退出统一使用公开 ShouldQuit 和 WindowClosing hook，提示时不阻塞主线程；不依赖 app.Run() 返回后首次保存。测试将 Go 目录／请求规则与可替换适配器分开，原生边界使用专用关联在本机验收，真实取消／拒绝与待决退出仍有验证空白。没有新增产品代码或修改真实默认设置。

没有另建 ADR：当前是首版规划期，桥接隔离后替换代价有限，这项选型不同时满足 domain-modeling 的「难以逆转、没有背景会意外、存在实际权衡」三条件。决议与证据保留在本工单和架构资产。

后续由[应用优先界面如何处理长列表、搜索、空态与键盘操作？](09-desktop-workflow-details.md)确认桌面工作流，再由[哪些验收情景足以让首版规格进入开发？](07-spec-acceptance.md)汇总完成标准。
