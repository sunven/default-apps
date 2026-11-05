# 02 常用关联目录验收

2026-11-05，macOS 27.2／Apple Silicon；基于 ticket 01 的正式窗口与只读查询。此工单增加真实 UTType 多结果解析、常用目录、协议查询和两个浏览入口，没有链接 setter、注册夹具或改变默认。

## 通过的行为与证据

| 验收 | 结果 |
| --- | --- |
| 常用种子与身份 | 17 个扩展名输入通过 `typesWithTag:tagClass:conformingToType:nil` 正式解析，加 4 个独立 scheme。在这台 Mac 得到 **17 个已声明文件类型＋4 个协议**，不是固定 16 行。[原始目录](native-catalog.json)保留 kind、identifier、所有扩展名／MIME 标签与输入来源。 |
| 别名与歧义 | jpg/jpeg 合并为 `file:public.jpeg`，仍保留 `file:com.microsoft.ppt.export.ext.jpg`。前者当前 Preview，后者当前 Safari；列表直接显示各自 identifier，选择任一项可看到自己的默认。RTF、PNG、TIFF 的其他已声明类型也保留。 |
| 原生查询 | 新鲜[独立 Swift 基线](independent-before.json)逐一对比正式服务的[21 项查询](native-queries.json)，所有当前规范路径与候选路径集合相同。包含 PDF、JPEG、http、https、mailto 及所有其他可解析常用项。 |
| 真实 UI | [Wails 交互记录](native-ui-checks.json)在 WKWebView 内逐个点击全部 21 行，核对对应标题、当前路径、每个候选路径与来源；协议与文件入口可切换，手动重新查询恢复可用。DOM 点击是合成交互，不声称硬件键盘验收。 |
| 未解析 | 当前常用种子全部可解析；另外向真实公开解析服务传入 `defaultapps-unknown-20261105`，得到动态 UTType 并保留为[未解析诊断](native-unresolved.json)，没有当作可用关联或查询。React 测试验证原因、不能查询／修改及后续「选择文件识别类型…」说明；真实选择器由 05 实施。 |
| 空值与错误 | Go 规则验证默认与候选独立：成功无默认、成功空候选、初次错误、刷新错误保留最后有效观察。React 验证这些状态、目录失败重试、空入口不残留旧详情，以及返回先前关联遇连接失败仍保留该关联的最后观察。 |
| 应用副本 | 沿用系统返回的规范路径，保留显示路径、版本、bundle ID。候选包含 Playwright 缓存目录下的 Chrome for Testing；Safari 展示 Cryptex 下真实位置。查询与应用扫描索引无外键依赖。已有 01 规则继续验证同 bundle ID 不同副本及规范位置去重。 |
| 最小窗口 | [原生尺寸](native-ui-checks.json)内容为 1001×700（Wails 外框宽 1000 的实际 1px 差异继续如实记录），标题栏 31px，横向溢出 0。[JPEG 双滚动记录](minimum-file-scroll.json)左侧 client/scroll=472/1468，右侧=577/1171；[原生截图](minimum-native.png)。 |
| 构建 | [普通签名 app 构建](ordinary-build.log)通过，启动成功，[普通窗口截图](ordinary-window.png)；MCP 只用于临时测试 binary，成品不带该标记。[产物检查](production-checks.json)确认 macOS 13 构建下限、产品身份及无 setter selector。 |
| 验证 | [Go `-race` 日志](go-test.log)：5 个 catalog＋5 个 association 公共边界测试通过；[React 日志](frontend-test.log)：10 个交互测试通过；TypeScript／Vite 生产构建通过。 |
| 日常默认未变 | 本轮[前后独立查询](baseline-check.json)对全部 21 项比较完全一致，当前默认及候选路径未变。没有用户确认动作、系统修改提示或写入实验。 |

## 视觉与辅助检查

沿用 01 已选 framed-sheet、macOS 系统字体、文件箭头标记与最小内容尺寸，没有重新选择方向。屏幕回答「这个具体文件类型／协议由哪个副本打开」，列表展示类型身份，详情分别呈现当前默认、系统候选和来源。应用优先入口、完整搜索与键盘在 03／04 接续。

以真实 WKWebView DOM＋生产 CSS 保存 JPEG、mailto、最小窗口的离线副本，浏览器只做静态检查；服务与交互证据来自上面的原生运行。[视觉报告](visual/report.json)在 1440、1280、1000px 为 **0 FAIL／2 WARN**，三个首屏及原生截图均已查看。`hero-void` 是路径与右侧版本列之间的宽度，保留用于长路径；`tiny-text` 来自 12px identifier／扩展名／版本等次要字段，主名称 14/16px，路径 13px，保留桌面目录密度。未用虚构内容填充。检查器 1000px 默认高度 625 低于产品最小内容高度，单独以原生 700px 实测。

[源码视觉检查](visual-lint.log)0 FAIL／0 WARN。Agent-browser axe [JPEG](a11y.json)与[mailto](a11y-mailto.json)均 0 violations；JPEG 有 1 类 incomplete，原因是滚动容器裁切／屏外行的背景无法自动判定。静态色彩测量没有低对比度文本；这项自动未决保留原始记录，不冒充全部辅助功能验收。

## 复现与边界

`check-native.py` 调用 Wails 3.1.0 自带的 `mcp` 标签测试接口，loopback 9102。正式源码没有诊断服务；原生查询来自产品的同一个 Go／cgo 适配器。`independent-query.swift` 直接使用公共 AppKit／UTType 进行独立只读对照。运行：

```sh
wails3 task darwin:package
CGO_CFLAGS='-mmacosx-version-min=13.0' CGO_LDFLAGS='-mmacosx-version-min=13.0' MACOSX_DEPLOYMENT_TARGET=13.0 go build -tags production,mcp -o bin/default-apps-qa .
WAILS_MCP_PORT=9102 ./bin/default-apps-qa
swift .scratch/default-apps-v1-implementation/assets/02/independent-query.swift > .scratch/default-apps-v1-implementation/assets/02/independent-before.json
python3 .scratch/default-apps-v1-implementation/assets/02/check-native.py
go test -race ./...
npm --prefix frontend test
```

正式产品仍只有只读能力。`Resolve` 是后续声明／手动项可复用的无副作用公开解析边界；本工单没有实现应用扫描、手动持久化、文件选择器或修改请求。声明来源合并用确定性输入验证，真实应用声明读取由 03 完成。
