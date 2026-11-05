# Default Apps 主流程原型

抛弃式 UI，回答一个问题：首版应该让用户先选应用、先选关联项，还是先搜索？本轮仅确定可进入开发的规格，用户选择后记录设计决策，产品代码另行实现。

修改交互已另建为[单文件状态原型](change-semantics-prototype.html)，可直接双击打开，无需服务器。用户已选择逐项立即修改、手动改回和持续等待；[修改语义决议](../../../../.scratch/default-apps-v1/issues/05-change-semantics-prototype.md)是产品依据。原型保留其他方案及九个情景供回看；[运行与证据边界](change-semantics-README.md)说明所有操作均为模拟。

桌面长列表、搜索、空态与键盘细节另见[桌面工作流原型](desktop-workflow-prototype.html)及[运行与验证说明](desktop-workflow-README.md)。它沿用已选的应用优先结构，A/B/C 仅比较滚动方式，用户已选择 A 双列表独立滚动、1000×700 与完整搜索／键盘规则。

## 运行与比较

在项目的 `frontend` 目录运行：

```sh
npm run prototype
```

命令在 `127.0.0.1:9245` 启动开发服务器并打开 A。下面三个链接共用一个页面；底部左右箭头切换方案，未聚焦输入框或对话框时也可用键盘左右箭头。切换保留内存中的默认值和待修改选择，搜索和浏览方式重置。刷新或点击“重置”恢复示例。

| 方案 | 打开原型 | 工作方式 | 对比图 |
| --- | --- | --- | --- |
| A 应用优先 | [A](http://127.0.0.1:9245/?prototype=default-apps&variant=A) | 左侧应用列表，右侧展示所选应用的声明支持与当前默认，逐项设为该应用 | [应用视角](../../../../.scratch/default-apps-v1/assets/prototype-A.png) |
| B 关联项优先 | [B](http://127.0.0.1:9245/?prototype=default-apps&variant=B) | 文件类型或协议列表，旁边展示当前默认与系统候选；应用是另一个浏览入口 | [关联项视角](../../../../.scratch/default-apps-v1/assets/prototype-B.png) |
| C 搜索优先 | [C](http://127.0.0.1:9245/?prototype=default-apps&variant=C) | 统一搜索，关联项和应用分组展示，选择后打开对话框 | [搜索 .jpg](../../../../.scratch/default-apps-v1/assets/prototype-C.png) |

可体验：把 PDF 改为预览、搜索 `.jpg` 查看两个不同的文件类型、在其他应用列表中区分两份预览、添加 `custom` 并通过示例文件识别。右下方“状态”显示完整 JSON，切换方案也会输出到浏览器控制台。

用户已于 2026-11-05 选择 **A「应用优先」** 作为首版主入口：先选应用，右侧检查声明支持与系统当前默认，同时保留文件类型和 URL 协议入口。[主界面决议](../../../../.scratch/default-apps-v1/issues/04-main-workflow-prototype.md)记录选择和边界。B、C 保留用于回看比较；原型切换栏与左右箭头不属于产品导航规格。

## 数据和边界

- 所有操作仅修改 React 内存；未调用 Wails、NSWorkspace 写入或真实文件选择器。
- 图标来自本机 NSWorkspace 只读提取的应用图标。PDF、JPEG、mailto、http 和同扩展名对应两种类型的例子参考[只读调查](../../../../.scratch/default-apps-v1/research/macos-association-api.md)；其余默认值、候选、声明子集、部分版本和额外的预览副本均为示例，列表并非这台 Mac 的完整目录。
- “选择其他应用”使用示例应用列表；“从文件识别”使用三个示例按钮。正式版的 `.app`、文件选择和扫描策略另按已确定的目录决策实现。
- “选择后统一应用”的状态仅用于历史比较；首版已选择逐项立即修改。系统结果与回读以修改语义决议为准，[原生行为探针](../../../../.scratch/default-apps-v1/issues/08-native-behavior-probe.md)记录实机依据和未验证边界。
- 页面只在开发环境且带 `?prototype=default-apps` 时加载；普通生产构建不包含原型代码、CSS 或图标。原型不代表 Wails 原生窗口与标题栏已经验证。

## 验证记录

2026-11-05：TypeScript / `npm run build` 通过，生产目录仅包含原有应用脚手架代码。真实浏览器检查了三个方案、待修改跨方案保留、模拟应用、搜索歧义、其他应用、副本、未知类型和示例识别、无结果空态、URL 视角选择、Escape 关闭以及键盘切换与输入框内箭头。

用户明确这是桌面应用，不考虑移动端；已删除移动端与平板堆叠布局。原型临时以 900px 为桌面宽度下限，最终原生窗口最小尺寸尚未定案。检查 1000 × 618 和 1000 × 700 窗口的缩放及滚动；内容区滚动，底栏占独立空间。最终自动视觉检查仅使用 1440、1280、1000 的桌面宽度，三个方案均为 0 FAIL，报告保存在项目根目录 `.taste-skill/prototype-desktop-A/`、`prototype-desktop-B/`、`prototype-desktop-C/`；工具将 1000px 截图命名为 tablet，其含义只是桌面窗口宽度。先前 390/768 的截图是过期探索，不属于规格或后续验证。

保留的 WARN：开发服务器是原型唯一入口，生产构建已经验证排除它；11–12px 用于版本、路径、标签及状态说明，主行与桌面操作文字为 13–14px；A 的整片详情区随窗口扩展，示例只有三行时会留空。源码 lint 的两个阴影提醒分别来自浮动原型切换栏和原生 HTML dialog，均为实际覆盖层。

视觉方向：Framed sheet，seed `1734816166`，采用 macOS 系统字体；产品特征是文件类型与当前／待选应用的关系及真实应用图标。[视觉评议](../../../../.scratch/default-apps-v1/assets/prototype-critique.md)记录取舍。

项目未初始化 Git，无法记录临时分支；以本目录源码、工单评论及本地截图作为可回看的原型资产。
