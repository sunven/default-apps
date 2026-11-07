# Default Apps UI 优化

2026-11-07。类型：software / macOS 桌面工具。

三个正式入口（应用、文件类型、URL 协议），关联详情、应用副本、手动补充、扫描问题，以及空态、查询错误、修改 / 恢复 / 退出状态均使用统一的浅色视觉系统。保留现有数据和请求流程。

## 设计

沿用项目已保存的 `framed-sheet` 方向：浅灰框架、白色内容面板、细分隔线、蓝色选中与操作反馈。使用原生 macOS 字体与适合工具列表的字号；统一 8 / 12 / 16px 圆角、左右内边距与控件样式。

导航增加类别图标；名称、版本、路径分级；已是默认的行使用文字与对勾共同提示；错误与恢复为浅暖色，确认成功为浅绿色。按钮使用技能原样提供的 motion 层，保留 reduced-motion。图标是 Lucide 控件 / 类别图标，不冒充应用品牌标识，许可证随前端产物分发。

这是应用界面，不采用营销页面的 hero、整屏内容分区、随机网站模板、照片、shader、scene 或 moment。没有新增品牌、价格、地址、时间或素材占位。

## 已验证

- 55 项现有 React 测试通过，包括搜索、键盘浏览、输入法、嵌套弹窗焦点恢复、查询及修改生命周期。
- TypeScript / Vite 生产构建通过。
- `wails3 task darwin:package` 通过；`codesign --verify --deep --strict bin/default-apps.app` 通过。
- 三个主页面在 1440×900、1024×768、1000×700、820×1180、768×1024、390×844 均没有横向溢出或浏览器异常。
- 检查产物确认视觉测试夹具未进入生产 JS；`motion.css` 和 `motion.js` 与技能原件完全一致。

正式应用：[bin/default-apps.app](../../bin/default-apps.app)。

## 检查器适用范围

技能的 `assets/layout/check.mjs` 对 `.wrap` 有硬依赖。应用使用原有 `.app-shell` / `.browser-workspace`，因此六种尺寸均报告 `container: no .wrap`。加 `--shots` 时脚本还会因结果缺少 `sections` 而抛错；不带 `--shots` 时能完成所有尺寸的溢出和异常检查。未修改技能文件，也未为消除报告而给应用伪造营销结构。完整截图使用技能的 `shoot.mjs` 获取。

`consistency.mjs` 的营销页面规则不等同于本工具的验收条件。以下报告按规则审查：

| 规则 | 本次判定与理由 |
| --- | --- |
| `hero-fill`、`hero-screen`、`section-height`、`section-air`、`one-section`、`section-gaps` | 不适用。工具窗口同时包含标题、搜索、表头与可滚动列表，不能将每一部分做成整屏。 |
| `container-edges`、`off-grid`、`nav` | 营销容器假设不适用。应用有侧栏与工作区，主页面的内边距统一；窄屏导航占整行。 |
| `flush` | 列表选中背景与可滚动区域对齐，首行内容仍有内边距。 |
| `text-only`、`no-visual` | 实际应用列表即产品内容，无需照片、渲染或营销插图。 |
| `button-styles` | 同一控件外观有工具栏 36px、行内 30px、状态栏 26px 三种密度，适用于桌面工具。 |
| `motion-layer` | Vite 把 motion CSS 打包为哈希资源名，检查器按独立文件名识别而误报。构建内容与源码核对确认实际加载；技能文件未改。 |
| `overlap-text`、`cut-text` | 检查器按未裁切的文本矩形判断滚动区域外的行和省略路径。截图核对可见文字无叠压；路径省略保留 title 和详情内的完整路径。 |
| `text-contrast` | 初次报告数量标签只有 4.45:1，已将统一辅助文字色加深。数量标签现为 4.95:1；最终自动复查见下文。 |

## 复现

从仓库根目录运行：

```sh
node .taste-skill/ui-refresh/build-preview.mjs
python3 .taste-skill/ui-refresh/check-pages.py
```

脚本以真实 React 页面配合隔离的 Wails 响应夹具生成视觉入口，浏览器由技能脚本逐个启动和关闭。生成页面、截图与原始日志位于 `.scratch/ui-refresh/out/`，不会进入正式构建。

视觉验证使用隔离数据，不代表再次执行了真实系统默认应用修改或 macOS 原生选择器操作。后端没有改动；本次未重新执行原生修改实验。

## 视觉复查

首轮 40 张截图：3 个主页面各 6 种尺寸，加 11 类弹窗 / 状态各 1000px 与 390px。全部成功生成，无浏览器异常、横向滚动或视觉资源警告。另补候选列表滚动位置、减少动态效果模式，并重新核对成功提示配色。

- [应用页](../../.scratch/ui-refresh/out/app-1440.png) · [1000px 原生最小窗口](../../.scratch/ui-refresh/out/app-1000.png) · [窄屏](../../.scratch/ui-refresh/out/app-390.png)
- [文件类型](../../.scratch/ui-refresh/out/file-1440.png) · [URL 协议](../../.scratch/ui-refresh/out/scheme-1440.png)
- [关联详情](../../.scratch/ui-refresh/out/detail-1000.png) · [候选列表](../../.scratch/ui-refresh/out/candidates-1000.png) · [手动补充](../../.scratch/ui-refresh/out/manual-1000.png)
- [恢复确认](../../.scratch/ui-refresh/out/recovery-confirm-1000.png) · [退出说明](../../.scratch/ui-refresh/out/quit-1000.png) · [查询失败](../../.scratch/ui-refresh/out/error-1000.png)

应用包内可执行文件 SHA-256：`9583cecb83529ee966bdf6d1ed49a383affadb91186aa746d05d490a8b213f41`。

## 最终自动检查结果

- `consistency.mjs`：文字对比度、资源、横向溢出、视口边界、可见内容、减少动态效果与 WebGL 检查通过；5 种宽度均无浏览器异常。原始统计为 **146 FAIL / 74 WARN**，因此不称为全项通过：剩余 FAIL 全部对应上表已说明的营销布局假设与滚动裁切识别。`hover` 的一次 WARN 选中了独立滚动列表中第六行、当时被页脚外的滚动裁切区域遮住的「详情」按钮；可见按钮的动作层实际存在。
- `perf.mjs`：1440px 与 390px 均 **0 FAIL / 0 WARN**。隔离预览总传输约 69 KiB，FCP / LCP 中位数均约 40ms，CLS 为 0.007 / 0.000，无长任务、损坏请求或 WebGL 上下文。这是无头 CPU Chrome 的相对指标，不是原生启动耗时。
- 正式构建 JavaScript 约 210 KiB（gzip 约 68 KiB），CSS 约 30 KiB（gzip 约 6.5 KiB）；未引入运行时网络字体、图片或新 npm 依赖。
- 最后一处成功提示配色调整后，55 项测试及原生打包再次通过；补验 4 张截图均无异常。

原始记录：[布局检查](../../.scratch/ui-refresh/out/layout-app.json)、[一致性检查](../../.scratch/ui-refresh/out/consistency-final.json)、[性能报告](../../.scratch/ui-refresh/out/perf.log)、[原生打包日志](../../.scratch/ui-refresh/out/package.log)。

## 侧栏调整

按反馈移除左侧应用列表的路径行，最小行高统一为 68px，保留名称、版本与声明关联数量。路径搜索、应用副本识别和详情中的路径不变。55 项测试再次通过，已复查 1000×700 应用页截图，并重新打包及验证签名。
