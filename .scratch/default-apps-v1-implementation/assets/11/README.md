# 11：自用成品与最终集成验收

2026-11-06，**通过**。适用范围为 macOS 27.2（26B123）／Apple Silicon；macOS 13 是构建下限，没有据此验证所有 13+ 系统。完成全部 25 项必需验收，采用已确认的分层门槛。最终生产代码为 `4196f131e3f201cb57a7792fb217df42cdfd6ff9`：在 10 的 `bea5153` 功能基础上仅调整目录动作栏宽度与文字均衡折行。目录、查询、原生修改、持久化、同步、退出和 React 行为未改变；本目录之后的文档／工具提交不改变产品。

正式交付位于 `/Users/sunven/github/default-apps/bin/default-apps.app`，可执行 `open bin/default-apps.app`。这里只复制普通 bundle，未复制隔离验收配置。普通二进制 SHA-256 为 `9e22d5ac72d9b8ac612f08bea0d59c3c3b4c5b2f7309f93c4856373d1dc04ac8`；[交付记录](deliverable.json)、[普通／开发元数据与实际启动](products.json)、[环境版本](environment.json)提供完整身份与证据。

## 构建与范围

执行 `wails3 task darwin:package`，任务使用 `npm ci`、现有锁文件、Go 1.27.3、Wails CLI／模块／runtime 3.1.0；实际 Node 26.13.0、npm 11.20.0，React 18.3.1、TypeScript 5.9.3、Vite 8.3.5。锁文件 SHA-256 为 `db07624124178dae6a4f51c251d1e17b6d6d5d0e28efba89ca125cc9f0906e47`。开发构建执行 `wails3 build DEV=true`，按 `darwin:run` 相同流程封装开发 plist／签名，再启动二进制。通常直接使用 `wails3 task run` 即可。

两个产物均为 Default Apps 0.1.0，bundle ID `io.github.sunven.default-apps`；plist 下限13.0.0、Mach-O minos13.0／SDK27.2、arm64、ad-hoc 签名，严格验证通过。普通和开发实际新进程均创建屏幕上的 Default Apps 窗口并正常退出，普通配置前后不变。[普通构建](ordinary-build-final.log)、[开发构建](dev-build-final.log)、[启动核对](products-check.log)及两份 startup 日志可复查。屏幕窗口／区域截图 API 本次返回无法创建图片，记录在 products.json；随后全屏截图成功，按同进程CGWindowBounds裁成[普通产品窗口](ordinary-product-window.png)，原始全屏仅保存在仓库外。[额外启动与捕获](whole-capture-attempt.json)记录其PID。开发启动的像素截图未取得；正式 UI 更详细的像素证据来自同生产源和资源的独立观察构建，下一节明确区分。

普通 build tags 只有 `production`，开发无验收 tag。[普通输入](ordinary-inputs-full.json)、[原生与 Wails 输入](ordinary-native-inputs.txt)、[开发输入](development-inputs.json)排除 `mcp`、`manual_smoke`、`lifecycle_smoke`、`change_smoke`、`native_acceptance`、`native_adapter_test`、`native_keyboard` 实现；off no-op文件不提供控制器。嵌入文件仅是正式 Vite index／JS／CSS，无原型、演练控制栏、压力样本或探针。生产包含真实类型和协议 setter，两种 writableKinds 均已观察；01–08 当时的“无 setter”检查是历史状态，已被09／10替代。

## 本轮组合补测

[Go race](go-tests.log)全部通过；[React](react-tests.log)5 文件45测试通过；[最终前端构建](frontend-build-final.log)通过。Go直接测试日志中的默认链接目标警告不替代成品 Mach-O 下限核对。CSS调整没有新增镜像实现的单元测试，改用原生窗口前后像素和尺寸验证。

[最终真实只读窗口](final-native-readonly.json)扫描92份本机应用，查询21个可解析常用身份。所有默认与候选路径均与另一个 Swift NSWorkspace 进程[逐项一致](final-query-comparison.json)，且与10清理后的21项日常快照完全相同。扫描局部问题、PDF实际默认及目录外候选、手动输入类型选择在[应用截图](final-native-app.png)、[扫描问题](final-native-scan-issues.png)、[PDF详情](final-native-pdf.png)、[手动输入](final-native-manual.png)可见。未调用任何真实 setter。[目录](final-native-catalog.json)、[服务查询](final-native-common-queries.json)、[独立查询](final-daily-readonly.json)保留原始结果。

[组合记录](combined-native.json)、[28步原生键盘](combined-keyboard.json)、[摘要](combined-summary.json)使用正式 Wails／React、真实配置文件、真实 plist 扫描、真实原生窗口／选择器，加一个独立编译的受控默认／setter适配器。102个专用手动应用位置和1000个声明是真实惯例格式文件，**没有注册到 Launch Services**；配置只在 `final11-controlled`，未放入产品。此层不冒充实际系统请求或 NSError。

- 实际 contentLayoutRect和contentMinSize为1000×700，原生外框1000×732，DOM因边界取整1001×701，横向溢出0。两个列表各自滚动，长目标路径和等待条、搜索、页脚动作均可见。
- 非零滚动在实际重新扫描前后保持 **应用333→333、关联777→777**，应用路径和搜索不变；三入口独立搜索／选择／滚动恢复，另记录555／444偏移。每个阶段受控请求仍只启动一次。[刷新像素](combined-nonzero-refresh.png)。
- 1000声明与长路径在[等待](combined-pending-stress.png)、[回读失败](combined-readback-failure.png)、[重开恢复](combined-recovery-stress.png)、[新请求说明](combined-recovery-warning.png)、[无声明](combined-no-declarations.png)、[无结果](combined-empty.png)状态可操作。宽度调整前后[旧目录行](pending-catalog-before.png)／[最终目录行](pending-catalog-final.png)表明长请求标签有完整宽度；[最终已确认行](confirmed-catalog-final.png)也已检查。
- AppKit合成事件经过实际NSApplication／WKWebView：⌘1/2/3、⌘F、↑↓、Home／End、Enter、Tab／Shift-Tab、Escape覆盖列表、手动、候选、退出、恢复对话框及合理焦点返回。不是硬件按键或现场输入法面板测试；组合修饰键／composition防误处理仍由04的React测试支撑。
- 未解析手动输入禁保存并解释；实际文件／应用选择器取消不改配置。05未变更的人工作选成功及跨进程保存、09未声明应用人工选择沿用原始证据。此次没有通过自动选择器假装人工作选。
- 受控回读失败继续门控并显示保留观察；查询重试确认原请求且不新增setter。真正新进程恢复长路径旧记录，旧结果仍未知，取消说明零写入；新明确操作才替换记录。[退出记录](combined-exit.json)。
- [失活／重新激活检查](inactive-activation.json)在1000声明下观察submitted事件及版本；重新激活后状态正确，没有显式requery或额外setter。

复用原生窗口键盘 helper 的临时 `.go/.m` 只在 [build-acceptance.sh](build-acceptance.sh) 构建时复制，trap删除，生产输入已核对。脚本和fixture见本目录，运行会改变其专用隔离配置；`prepare-combined.py`拒绝覆盖已有配置。重现组合首先调用 native-client.py 的 `launch('controlled')`，再执行 check-combined.py。普通交付不依赖这些文件。

## 全部25项验收矩阵

状态只使用「通过」「失败」「尚未执行」「尚未观察」。**规则**是公共Go／存储边界，**界面**是真实React交互，**原生**是正式Wails与本机API，**受控原生壳**是实际Wails进程和UI加受控系统边界，**构建**是实际产物检查。行状态「通过」指该编号的必需门槛，附加系统机会观察另列，不能互换层级。早期证据按当时构建保留，功能未变更后复用；最终组合由本目录补充。

| ID | 状态 | 层级与可复查证据 |
|---|---|---|
| CAT-1 | 通过 | 规则／原生：[03递归、损坏、权限和循环](../03/README.md)；[最终真实扫描与局部问题](final-native-readonly.json)。 |
| CAT-2 | 通过 | 规则／界面／原生：[02身份与标签合并](../02/README.md)、[05歧义选择](../05/native-ambiguity.json)、[最终手动输入](final-native-manual.png)。 |
| CAT-3 | 通过 | 规则／界面／原生：[05人工真实文件、明确保存与取消](../05/README.md)、[本轮未解析与双选择器取消](combined-native.json)。 |
| CAT-4 | 通过 | 规则／原生：[05同ID／手动位置／消失重现](../05/README.md)、[09同ID实际另一副本及未声明人工应用](../09/results.json)、[最终目录外候选](final-native-pdf.png)。 |
| QUERY-1 | 通过 | 原生／界面：[最终21项服务与独立进程精确比较](final-query-comparison.json)，默认／候选／声明来源分开，http／https独立。 |
| QUERY-2 | 通过 | 规则／界面／受控原生壳：[07查询失败保留最后有效值](../07/native-sync.json)、[本轮未解析／局部问题／回读失败重查](combined-native.json)。 |
| UI-1 | 通过 | 界面／原生：[04搜索、长路径、空态](../04/README.md)、[最终等待／恢复／长路径与空态](combined-native.json)。 |
| UI-2 | 通过 | 界面／原生窗口／受控原生壳：[最终1000×700、102副本／1000声明、双列表非零滚动](combined-native.json)、[最终CSS尺寸](final-polish.json)。 |
| UI-3 | 通过 | 界面／原生键盘：[04全部键盘规则及composition](../04/README.md)、[最终28步](combined-keyboard.json)，新增手动／候选／恢复／退出焦点均验证。 |
| UI-4 | 通过 | 规则／界面／受控原生壳：[07前台更新和原副本消失](../07/README.md)、[本轮三入口与非零刷新](combined-native.json)、[09真实待决浏览／查询／重载](../09/formal-native.jsonl)。 |
| WRITE-1 | 通过 | 规则／界面／原生：[09真实文件A→B→A](../09/results.json)、[10真实协议A→B→A](../10/results.json)，独立ID、明确动作、durable／initiation／completion／精确回读分别记录。 |
| WRITE-2 | 通过 | 规则／界面／受控原生壳：[06预查询变化、已是目标、不可用／未解析禁写](../06/README.md)、[07绑定取消零dispatch](../07/native-boundaries.json)；09实际同副本no-op。 |
| WRITE-3 | 通过 | 规则／界面／受控原生壳：[06重复／冲突／全局门控](../06/README.md)、[07原ID与丢回复重载](../07/README.md)、[10跨file／scheme门控](../10/README.md)。 |
| WRITE-4 | 通过 | 规则／原生：[09成功＋精确路径、另一同ID副本nil回调不确认](../09/results.json)、[10精确协议回读](../10/results.json)，不按bundle ID宣称成功。 |
| WRITE-5 | 通过 | 规则／界面／受控原生壳／实际错误：[09人工拒绝的NSCocoaErrorDomain／256原文](../09/results.json)、[06独立错误与回读](../06/README.md)、[本轮回读失败／只查询恢复](combined-native.json)。 |
| WRITE-6 | 通过 | 规则／受控原生壳／原生：[07受控90.0388秒等待和晚到](../07/native-crosscase.json)、[09实际超26分钟回调／退出重开](../09/README.md)、[09／10回调所有权](../10/HANDOFF.md)。 |
| SYNC-1 | 通过 | 规则／界面／受控原生壳：[07事件、快照、旧查询、原ID／恢复ID](../07/README.md)、[最终失活／激活](inactive-activation.json)；原生adapter未修改同步代码。 |
| STORE-1 | 通过 | 规则／界面／原生：[05版本化保存、损坏保留、失败与人工重启恢复](../05/README.md)、[最终同配置实际重开](combined-native.json)。 |
| STORE-2 | 通过 | 规则／受控原生壳：[06保存失败零setter](../06/README.md)、[08保存后启动前／启动后真正SIGKILL和重开零重放](../08/native-lifecycle.json)；[09真实pending持久化](../09/pending-durable-before-exit.json)。 |
| STORE-3 | 通过 | 规则／界面／受控原生壳：[06已知结果与清除错误分离](../06/README.md)、[08清除失败后的新进程旧结果未知](../08/native-lifecycle.json)。 |
| RECOVER-1 | 通过 | 规则／界面／受控原生壳／原生：[08匹配／不同／失败与明确替换](../08/README.md)、[09真实退出／重开](../09/native-exit.json)、[最终恢复焦点／记录](combined-native.json)。 |
| RECOVER-2 | 通过 | 规则／界面／受控原生壳：[08新请求期间受控旧请求外部影响](../08/native-external-change.json)、[07当前观察与历史事实分离](../07/native-crosscase.json)。真实旧系统提示跨进程存活在09观察；不据此声称所有跨进程时序均实测。 |
| QUIT-1 | 通过 | 规则／原生窗口／受控原生壳／真实pending：[08三入口留在／退出和callback竞态](../08/native-lifecycle.json)、[09真实pending菜单／⌘Q／最后窗口关闭](../09/native-exit.json)、[最终quit焦点](combined-keyboard.json)。 |
| BUILD-1 | 通过 | 构建／原生进程：[实际普通／开发身份、签名、下限、启动退出](products.json)、[工具与锁文件](environment.json)、[稳定交付](deliverable.json)。 |
| BUILD-2 | 通过 | 构建／界面：[生产输入](ordinary-inputs-full.json)、[原生模块输入](ordinary-native-inputs.txt)、[开发输入](development-inputs.json)、[同源最终真实UI](final-native-app.png)，没有原型／压力／probe／smoke／MCP。 |

## 真实专用写入与观察限制

本轮11未新增真实系统写入；以下为正式产品09／10的新鲜专用namespace，不是历史独立探针。完整日期、环境、提交前默认、人工动作、提示、原始NSError、目标／回读路径、请求ID、进程、清理均由链接的逐次记录给出。

| 实际观察 | 状态 | 证据与限制 |
|---|---|---|
| 文件类型A→B→A | 通过 | [09结果](../09/results.json)；两次新请求nil completion，精确规范路径及独立Swift回读一致。 |
| URL协议A→B→A | 通过 | [10结果](../10/results.json)；接受至completion为13.340／12.956／11.513ms（含建立A），指定类型作为只读control保持B。 |
| 真实系统拒绝 | 通过 | 09人工选“继续使用A”；实际错误NSCocoaErrorDomain／256／The file couldn’t be opened.，实际仍A。不是通用取消码定义。 |
| 真实pending浏览／查询／reload／三quit入口／stay／exit／restart | 通过 | [09记录](../09/formal-native.jsonl)、[退出](../09/native-exit.json)：旧系统提示跨原进程退出存活；重开零重放，旧结果未知；后来人工允许、当前匹配不补写旧成功。 |
| 同ID另一副本 | 通过 | 09选择原A，nil completion但实际A Copy，confirmed=false，目标与实际完整路径都保留。 |
| 未声明应用 | 通过 | 09人工原生picker选专用Undeclared，明确提交并人工允许，exact-path成功；不保证所有未声明应用被系统接受。 |
| 协议系统提示／持续待决 | 尚未观察 | 10三个真实请求均11–14ms返回，无提示或足够长的真实等待窗口；受控scheme等待／reload另为规则和界面证明，09真实file等待为共享生命周期实证。 |
| 新进程新请求与旧进程请求的全部真实交错 | 尚未观察 | 09只实际观察旧提示跨退出仍在及之后的当前路径；完整交错由08受控外部影响覆盖，不承诺跨进程串行或撤回。 |
| 日常PDF／浏览器／邮件默认真实改写 | 尚未执行 | 范围内仅查询，未授权或执行日常写入；专用测试不等于保证每种系统关联都能接受任意目标。 |
| 其他macOS版本／Intel／universal、商业分发、公证／商店／更新 | 尚未执行 | 不在首版自用签收范围。 |

09的专用token为 `419b7422bf684b7aaa7af96e558de0c1`，10为 `3a3a1716722f4165ab1af27186902b3f`。两轮都保存独立实验前、后、精确注销后快照：09注销4个manifest路径，10注销2个；专用关联default和candidates为空，无残留，日常21项默认与候选完全相同。[09清理](../09/cleanup-result.json)、[10清理](../10/cleanup-result.json)、[10比较](../10/daily-comparison.json)、[11最终只读比较](final-query-comparison.json)。未重置Launch Services全库，未声称系统历史被清成“从未设置”。11的102个plist夹具从未注册，最终隔离配置无pending，全部QA进程正常退出；保留惰性文件供复核。

## 证据修正与视觉核对

失败的测试工具尝试不标为产品通过：[错误row选择器](harness-failure-selector.log)、[长轮询超时](harness-failure-long-poll.log)、[错误JS引号导致MCP无回复](harness-failure-quoted-selector.log)、[Python未识别无XML声明plist](harness-failure-plist.log)保留。修正选择器编码、外部短轮询、原生激活和系统plutil解析后，从同一有效checkpoint继续，未重复改写系统。首个待决UI延迟时，公共快照已submitted；一次只读query恢复显示。最终单独[失活激活重验](inactive-activation.json)无显式requery，正常收到事件、显示submitted、setter仍1，不能把初次工具超时伪装为原生失败或隐去。第二运行证明真实非零scroll，不沿用07的0→0作为非零证据。

沿用已确认A应用优先、Framed sheet、macOS系统字体与原生窗口，没有重新设计。实际像素已逐张查看：等待与恢复的长路径保留完整换行，列表与固定工具栏分离；状态色仅作用于事实，空态不显示旧关联；最小窗口的新对话框按钮可达。目录请求文字原先拥挤，最终统一138px动作列并均衡折行，改善可读性；没有用缩小文字隐藏问题。

视觉工具检查冻结的正式原生DOM及产品CSS（无脚本，只用于视觉，非行为测试）：[报告](visual/report.json)、[日志](visual-inspect.log)，1440／1280／1000px全部0 FAIL、3 WARN，三个截图均检查。blank-gap／hero-void是筛选到单条结果后刻意保留的固定列表工作区，确保工具栏和底部操作不跳动；tiny-text是12px路径／版本元信息与11px行状态，主要名称14px、标题24px。lint的单一shadow警告仅来自实际浮层dialog。1000px自动截图高度625低于支持下限，完整700px证据以本机窗口为准。agent-browser检查此冻结DOM，已关闭会话；未把静态截图当作Wails交互。
