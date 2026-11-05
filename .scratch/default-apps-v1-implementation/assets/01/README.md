# 01 正式窗口与 PDF 查询验收

2026-11-05，macOS 27.2／Apple Silicon。此工单完成正式窗口、只读 PDF 查询、产品身份和构建基线。正式产品没有原生 setter；没有更改 PDF、浏览器或邮件默认。

## 已通过

| 观察 | 结果与证据 |
| --- | --- |
| 普通 `.app` | `wails3 task darwin:package` 成功、ad-hoc 签名验证通过，直接启动后呈现真实 PDF 查询。[构建日志](ordinary-build.log)、[窗口截图](ordinary-window.png) |
| 开发 `.app` | `wails3 build DEV=true` 后 `wails3 task run` 成功，使用内嵌开发资源启动正式入口。[构建](dev-build.log)、[启动和签名](dev-launch.log)、[截图](dev-window.png) |
| 产品身份与下限 | 两份 plist 的名称均为 Default Apps，bundle ID 均为 `io.github.sunven.default-apps`，描述一致。两份 Mach-O `minos 13.0`，plist 为 13.0.0，签名为 ad-hoc。[原始元数据](build-metadata.json)。13 仅是构建下限；本次没有验证其他系统或架构。 |
| 真实默认与候选 | 生产 React 经生成绑定 → `association.Service.Query` → cgo → `NSWorkspace`／`UTType` 返回 Google Chrome 当前默认和 8 个候选副本。[原生服务结果](native-query.json)与[独立 Swift 公共 API 查询](independent-query.json)路径逐项一致。 |
| 范围外副本与规范路径 | 系统候选包含 `~/Library/Caches/ms-playwright/.../Google Chrome for Testing.app`；Safari 为 Cryptex 下真实应用包路径。没有按名称、bundle ID 或小写路径合并。原始结果记录名称、版本、显示路径、规范路径和 bundle ID。 |
| 内容下限 | 正式代码根据 NSWindow 样式设置 `contentMinSize=1000×700`，用 `frameRectForContentRect` 另算标题栏。真实 WKWebView 在请求最小外框后实测 **1001×700**，外框高 731、内容高 700、横向溢出 0；保留这 1px 实测差异，没有把外框尺寸当内容尺寸。[尺寸与刷新](native-ui-checks.json)、[最小窗口](minimum-window.png) |
| 真实窗口刷新 | 在正式 WKWebView 点击「重新查询」后恢复可用按钮并继续呈现实际默认；独立原生查询仍为同一默认。[操作结果](native-ui-checks.json) |
| Go 规则 | 5 个公共服务边界测试覆盖独立查询、范围外默认、空结果／初次错误、重查失败保留各自最后有效观察、同 bundle ID／大小写路径区分、规范路径去重和观察副本所有权。`go test -race ./...` 通过。[日志](go-test.log) |
| React 行为 | 6 个真实 React 交互测试，通过生成绑定边界的确定性替身验证：当前／候选独立显示，名称／版本／路径，空值，刷新失败保留旧值，初始失败重试，查询中与刷新中，Tab 到结果滚动区域。[日志](frontend-test.log) |
| 正式入口排除 | 移除问候服务、时钟事件和演示入口；普通与开发入口一致。生产资源无原型标记，普通 binary 无 `setDefaultApplicationAtURL:` selector；删除 Wails `Assets.car`，应用图标换成文稿箭头标记。[检查结果](production-exclusions.json) |

## 视觉与可访问性

沿用已选 Framed sheet 方向（历史 seed `1734816166`）、macOS 系统字体、浅灰框架、白色内容面板和文件箭头标记，没有重抽方向。屏幕先回答「PDF 当前由哪个具体副本打开」，随后列出独立系统候选。全部为真实查询数据；无占位应用或模拟成功。

[视觉报告](visual/report.json)使用从真实 WKWebView 捕获的 DOM 和精确产品 CSS，在 1440、1280、1000px 桌面宽度检查，**0 FAIL／1 WARN**；三个首屏截图均已查看。`hero-void` WARN 来自完整路径身份列与右对齐版本列之间的空白；保留该列宽以显示真实长路径，未用装饰或虚构数据填补。1000px 检查器默认高度 625，低于产品支持的最小内容高度；原生 700px 截图和尺寸记录另行验证。

初次 axe 发现结果滚动区域缺少键盘焦点，已增加具名、可聚焦 region 和焦点外框；交互测试先失败再通过。最终捕获页面的 [axe 结果](a11y.json)为 **0 violations／0 incomplete**。浏览器实际 Tab → Tab → End 后焦点在「PDF 查询结果」，scrollTop 为 376，横向溢出 0：[键盘结果](keyboard-scroll.json)、[后段候选截图](keyboard-last-candidates.png)。这不是全部 macOS 辅助功能或原生快捷键验收；完整桌面浏览留给 04。

## 证据边界与复现

普通／开发 app 启动截图取自实际 `.app`，没有修改应用关联。为读取真实 WKWebView 尺寸和驱动控件，另以 Wails 自带 `production,mcp` 编译标记创建临时 `bin/default-apps-qa`，监听 loopback 9101；产品源码没有增加诊断服务，普通和开发成品不带此标记。`check-native.py` 调用它已有的 `js_eval`／`window_control`，对照同目录 `independent-query.swift` 的独立只读结果，并保存真实 DOM 的离线视觉副本。离线副本中的按钮不执行服务动作；原生实际刷新记录与静态视觉／axe 检查分开。

关键复现命令：

```sh
wails3 task darwin:package
wails3 build DEV=true
wails3 task run
go test -race ./...
npm --prefix frontend run test
```

工具链检查在构建前执行：Go 1.27.3、Wails CLI／Go 模块／runtime 3.1.0，React 保持 18，前端使用 `npm ci`。锁文件增加测试所需开发依赖，现有应用依赖版本未升级。C ABI 仅传字符串和整数；原生返回 malloc-owned JSON，Go 复制后释放；主线程断言保护查询，首次调用来自应用壳可调度后的 React 绑定请求。

没有通过此工单宣称应用目录发现、协议目录、写入、退出恢复或系统确认已经完成。它们继续由后续已批准工单实现。
