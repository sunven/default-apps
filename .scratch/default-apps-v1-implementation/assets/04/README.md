# 04 桌面搜索与键盘浏览验收

2026-11-06，macOS 27.2／Apple Silicon。正式浏览界面沿用用户选定的 A 双列表独立滚动与 Framed sheet；最小原生内容 1000×700，标题栏另计。只读查询，不接通任何默认写入。

| 检查 | 结果与证据 |
| --- | --- |
| 搜索与身份 | [React 交互测试](frontend-test.log)覆盖名称、版本、安装路径、bundle ID、声明关联匹配及右侧独立筛选；应用元数据命中显示全部声明，仅声明命中显示匹配范围。常用关联优先，两个 `.jpg` 类型保持独立身份，同名副本按规范路径区分。 |
| 焦点与会话 | 应用列表一个 Tab 停靠点，关联当前行名称与详情各一个；↑↓／Home／End 只在列表中操作，输入法 composing／229 和带修饰方向键不被抢占。Enter 进入关联或空态筛选，详情／嵌套副本对话框 Escape 回到触发控件，Tab 约束在顶层对话框内。每个入口保存本次会话搜索、选中身份与滚动位置；切换应用重选首个可见关联。 |
| 空态与消失 | 无搜索结果清空旧详情，无声明保留其他入口；完成扫描确认选中副本消失时保留原路径而不替换成同名副本。扫描中保留已知目录直至最终快照，避免进度快照误换选择。独立默认若仍指向消失路径，保留实际查询并另外标记目录缺失。 |
| 原生键盘 | [19 步断言](native-keyboard.json)由同进程 AppKit `NSEvent` keyDown/keyUp 经 `NSApplication.sendEvent` 进入正式 WKWebView，核对 DOM 实际焦点与入口：Tab／Shift-Tab、↑↓／Home／End、Enter、Escape、⌘F、⌘1／2／3、空态 Enter。真实菜单对四组产品快捷键无匹配冲突。记录当前 `tabFocusesLinks=false`，`AppleKeyboardUIMode` 未显式设置；没有更改系统设置。 |
| 原生尺寸与目录 | [原生布局](native-layout.json)、[原始快照](native-snapshot.json)记录 **92 份应用、615 个关联、Xcode 154 个关联**。NSWindow contentLayoutRect 为 **1000×700**；WebView DOM 为 **1001×701**，横向溢出 0。应用列表 client/scroll 436/8102，关联列表 345/14629，两者独立滚动；应用标题、搜索固定，窗口 scrollY=0。见[实际 WebKit 像素截图](native-minimum.png)、[空态](native-empty.png)。 |
| 独立压力夹具 | [浏览器断言](browser-checks.json)使用实际 App 组件与样式、仅在测试 Vite 配置替换 Wails 服务模块：**102 份副本、1000 个关联、271 字符路径**。1000×700 横向溢出 0，Tab 停靠数为应用 1、关联 2；End 可到第 1000 行，完整路径在可滚动对话框展开。搜索、空态、无声明、同名／同扩展名身份以及双列表滚动通过。[最小窗口](scale-1000.png)、[末行](scale-end.png)、[完整路径详情](scale-detail.png)、[空态](scale-empty.png)。 |
| 构建与产物 | [普通 app 构建](ordinary-build.log)完成 TypeScript、Vite、Go 与 ad-hoc 签名。[产物检查](production-checks.json)确认身份／macOS 13 下限、签名及 `production` 标签；压力数据与原生键盘／MCP 测试工具不进入普通产物。 |
| 日常默认 | [之前](independent-before.json)与[之后](independent-after.json)的 21 项独立 Swift 默认／候选查询相同，[结论](baseline-check.json)记录零 setter、零测试应用注册。 |

20 个 React 测试通过，保留原先独立默认／候选、错误、刷新、未解析、扫描版本与目录外副本的覆盖；旧测试仅调整为先打开详情的用户路径。新行为逐个 red → green：`search-*`、`dialog-*`、`keyboard-*`、`session-*`、`missing-*`、`progress-*`、`observed-missing-*` 日志。`query-adaptation.log` 是永久详情移除后旧测试尚未改成打开对话框的中间失败记录；`query-green.log` 是嵌套测试辅助函数调整前记录，最终以 `frontend-test.log` 为准。

视觉保持已确认方向，没有重新抽签或移动端布局。屏幕核心问题是“此应用声明的关联当前由哪个具体副本处理”；最大区域为关联列表，左侧副本以版本／路径区分，品牌文件箭头与系统字体保持产品身份。1440、1280、1000 桌面宽度的[生产模式视觉报告](visual-production/report.json)为 **0 FAIL／1 WARN**；唯一 tiny-text 提示来自 12px 的版本、类型身份和路径，主名称 13–14px，可点击完整详情，因此保留目录密度。初始开发服务器报告另外提示 dev-server，生产模式复查已消除。查看各宽截图确认列边缘对齐、长标题折行、末行与关闭动作可达；没有渐变或固定卡片阴影。检查器自动选取的 1000×625 高度低于产品下限，仅用于外观辅助；最小内容可达性以上述 1000×700 实测为准。[源码检查](visual-lint.log)0 FAIL／0 WARN；[主界面 axe](a11y.json)及[详情 axe](a11y-dialog.json)均 0 violations／0 incomplete。详情初查发现重复 banner landmark，改为普通标题容器后清零，保留[修正前报告](a11y-dialog-before.json)。

原生证据是 **AppKit 合成的本进程原生按键**，不是人类硬件键盘输入；它比 DOM dispatch 更完整地覆盖菜单／响应链，但不声称验证所有 macOS 键盘设置或实际中文输入法候选面板。composing 保护另由公开 React 交互测试验证。测试原生构建采集之后仅补充扫描进度保留、消失副本说明以及对话框标题 landmark 修正，这两处状态分支由确定性测试覆盖；键盘和几何实现未变。全局等待条以及 05/06/08 新对话框的组合布局和焦点由相关工单及 11 继续核对。

## 复现

- `npm ci --prefix frontend`，`npm --prefix frontend test`，`wails3 task darwin:package`。
- 原生：仅测试时将 `harness/keyboard_evidence.go`、`.m` 拷到仓库根目录临时文件，编译 `-tags production,mcp,native_keyboard` 并启动独立 `.app`（MCP 9104、本机测试动作 9106），运行 `python3 …/04/check-native.py`。测试后删除临时根文件并停止自己的 PID。辅助工具不触碰任何系统确认／写入。
- 压力浏览器：`node frontend/node_modules/vite/bin/vite.js --config .scratch/default-apps-v1-implementation/assets/04/harness/scale.vite.config.mjs --configLoader native`；独立 session `default-apps-ticket04`、端口 9244，运行 `python3 …/04/check-browser.py`。agent-browser 空字符串 fill 未触发 React 更新的工具差异，改用实际 Escape 清空；没有修改产品行为来迎合工具。
- 生产样式检查：用同一测试配置构建到仓库外 `/tmp/default-apps-ticket04-scale`，静态服务端口 9246，运行 design-taste `inspect.mjs --app --widths 1440,1280,1000`。正式 frontend 构建从不使用测试配置或夹具。

05 组合边界：`Dialog` 导出 `{title, subtitle?, onClose, children}`，仅打开时挂载；Header 的 `header-actions` 中预留 `ManualActions`。05 自有手动组件插入此槽位、未解析文件识别入口和候选段尾，沿用本对话框，不再添加永久详情或重复全局 Dialog CSS。


## 04 与 05 合并核对

在 04 实现提交 `ade4ae7` 上合并 `integration/default-apps-v1` 的 `33bfcc9`（含已验收 05）。保留 04 双列表布局与 Dialog 的普通标题容器，将 `ManualActions` 放入固定顶部操作区和未解析类型详情，将 `ManualApplicationAction` 放入候选段，并保留手动不可用副本的原路径提示。删除 `manual.css` 重复的全局对话框／header-actions 样式，使共享布局只有一份定义。

组合后 [27 个 React 测试](combined-frontend-test.log)全部通过，[TypeScript／生产前端构建](combined-frontend-build.log)通过。此前 04 原生键盘／尺寸和05原生选择器证据保留各自边界，本次组合没有重复运行已通过的原生流程。06/08/11仍负责新增等待条与退出提示后的组合可达性。
