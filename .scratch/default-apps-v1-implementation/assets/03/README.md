# 03 应用优先发现验收

2026-11-05 至 2026-11-06，macOS 27.2／Apple Silicon。正式入口默认显示应用副本；后台扫描 `/Applications`、`~/Applications`、`/System/Applications`，声明目录与系统默认／候选独立。此次只读验收沿用已确认的正式窗口和工具版本。

| 验收 | 结果与证据 |
| --- | --- |
| 异步扫描与局部问题 | [正式 Wails 检查](native-checks.json)发现 **92 份应用、615 个关联、39 个未解析项**，耗时 174ms；企业微信两条缺少角色的声明作为局部问题保留。刷新受理 40ms、扫描 117ms，收到 0／10…90／92 份应用的递增版本事件，期间 JS 定时器继续运行；这是本次测量，不是耗时保证。[原始快照](native-snapshot.json)、[进度](native-progress.json)。 |
| 递归边界与真实副本 | [Go/race 日志](go-test.log)共 15 个测试通过，其中真实 Foundation plist 夹具覆盖嵌套目录、包内 helper、目录链接循环、包别名、坏 plist 和不可读目录；两份同名同 bundle ID 的 Reader 保留不同规范路径及 1.2／2.4 版本。夹具仅在临时目录读取，未注册到 Launch Services。真实扫描未纳入包内 helper，Safari 别名归并到 Cryptex 实际路径。 |
| 身份与声明来源 | 公共 Go 服务验证常用项优先、相同身份合并、歧义类型分行、未解析声明保留、现代声明优先于旧标签，以及类型定义／`None` 声明不冒充处理能力。损坏邻项的来源索引修复有 [red 记录](provenance-red.log)；通过结果见 Go 日志。 |
| 应用与关联浏览 | [13 个 React 交互测试](frontend-test.log)通过：默认应用入口、同名副本元数据、无声明空态、逐项独立默认、局部问题、目录外副本详情、旧快照晚到和查询失败区分。正式窗口选中 Preview 后显示 55 个声明关联及逐项查询；[窗口采集](preview-window.html)保留关联来源。 |
| 目录外候选与原生查询 | 正式窗口可选择 Playwright 缓存下的 Chrome for Testing 具体副本，[详情采集](outside-copy-window.html)记录完整路径。正式服务[21 个常用关联查询](native-queries.json)全部与[独立 Swift 查询](independent-before.json)的默认路径和候选集合相符；独立脚本沿用 [02 的版本](../02/independent-query.swift)。 |
| 事件快照稳定性 | 原生刷新暴露进度事件复用可变切片、异步序列化时数据改变的问题。[red](snapshot-red.log)复现已发布快照随最终排序改变；改为独立深拷贝后 [green](snapshot-green.log)与完整 Go/race 检查通过，上述原生刷新重新运行通过。 |
| 窗口与构建 | 原生内容 1001×700，横向溢出 0；应用／声明／查询三个区域均有独立滚动内容。[最小窗口](minimum-window.html)、[截图](minimum-browser.png)。[普通 app 构建](ordinary-build.log)完成 TypeScript、Vite、Go 构建和 ad-hoc 签名；[产物检查](production-checks.json)确认产品身份、13.0 下限、签名有效、无 setter 和 MCP 标签。 |
| 默认未变 | [验收前](independent-before.json)与[验收后](independent-after.json)全部 21 项默认及候选集合相同，[基线结论](baseline-check.json)记录零 setter、未注册夹具。 |

验收收尾复核了源码、测试日志及原始 JSON 的计数、规范路径唯一性、21 项独立查询和前后基线，没有重跑已经通过的整套原生检查。源代码与工单 `git diff --check` 通过；原始日志／DOM 的采集空白保留。

视觉辅助检查使用正式 WKWebView 采集的 DOM 与生产 CSS 离线呈现。[源码检查](visual-lint.log)0 FAIL／0 WARN；[视觉报告](visual/report.json)0 FAIL／1 WARN，提示 12px 次要元数据比例较高，保留当前目录密度并由 04 完成桌面交互核对。检查器 1000px 视口的默认高度低于产品下限，原生尺寸以上述 700px 实测为准。浏览器截图与合成 DOM 操作不代表硬件键盘验收。

复现入口：`go test -race ./...`、`npm --prefix frontend test`、`wails3 task darwin:package`；[check-native.py](check-native.py)连接以 `production,mcp` 标签临时构建的正式产品测试进程（loopback 9103）。`native-fixture-test.log` 保留早期独立运行的部署目标链接警告；最终完整 Go 日志及普通构建以 13.0 为下限通过。普通成品不带 MCP。

本工单完成应用发现和基本浏览；完整搜索／键盘由 04、手动项与选择器由 05、刷新时副本消失及查询竞态由 07 接续。没有接通默认修改，也不将这些后续行为记为已验收。
