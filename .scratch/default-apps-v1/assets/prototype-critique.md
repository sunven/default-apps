# 主流程原型视觉评议

日期：2026-11-05。依据真实浏览器截图和交互，采用 app-screen 规则；用于决定主入口，不作为产品视觉验收。摄影和营销页面动效标准不适用。三个方案都使用同一批样本与内存状态。

## 第一轮

ROUND 1
Seen in one second: A 是“预览支持哪些关联”；B 是“文件类型现在由谁打开”；C 是“搜索要更改的内容”。
Idea (one sentence): 让关联类型与应用的关系直接成为可操作内容。
Live thing: 可搜索类型、选择候选、查看并应用内存中的待修改。
Layout words by section: A=split list / B=table with inspector / C=grouped search with dialogs。
Scores: design 7 · usability 6.5 · creativity 6.5 · content 8 → overall 6.9。
Caps applied: 创意不超过 7；这些结构也适用于同类工具。
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. 原型小窗口的底栏与滚动内容叠在一起；限制内容区高度，底栏使用独立预留空间。
2. B 的窄窗口中导航下出现一条无用途的空带；随后按用户桌面范围保留完整左侧导航，删除堆叠切换。
3. C 搜索框的输入焦点框与容器边框重叠；移除输入内部 outline，保留容器的蓝色焦点边框。

上述三项已修正。另修正了无结果显示旧详情、切到协议视角保留文件类型选择的问题；这些交互问题通过浏览器操作验证。

## 最后一轮

ROUND 2
Seen in one second: B 的 PDF → Google Chrome 关系最明确；A 强调所选应用；C 强调搜索词。
Idea (one sentence): 以当前关联为主，让应用支持详情成为另一种查询路径。
Live thing: 搜索 `.jpg` 能看到 JPEG 与 PowerPoint 导出图像两种类型，候选选择先产生待修改状态。
Layout words by section: A=split list / B=table with inspector / C=grouped search with dialogs。
Scores: design 7.5 · usability 7.5 · creativity 7 · content 8 → overall 7.5。
Caps applied: 创意不超过 7；不声称已在 Wails WebKit 验证原生窗口。
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. A/desktop-fold 的短声明列表下仍有大片空白；保留为固定工具窗口的详情背景，不为示例填充内容。真实目录规模确定后再决定列表密度。
2. C 的初始列表让应用详情排在常用关联之后，小窗口要滚动；搜索时两组结果并列在阅读顺序中，但它仍更适合知道目标关键词的用户。
3. B/prototype-B.png 的 1000 × 700 窗口需要滚动才能看到后续行及全部候选；滚动可达，正式规格还要确定最小窗口和详情滚动策略。

用户明确只考虑桌面应用后，移除了移动端布局；最终检查宽度改为 1440、1280、1000，三方案均为 0 FAIL。源码 lint 0 FAIL。WARN 的处理说明见[运行与验证记录](../../../frontend/src/prototypes/default-apps/README.md)。

选择前的评议推荐 B 作为默认入口，保留 A 的应用支持详情。用户随后选择了 A「应用优先」；[主界面决议](../issues/04-main-workflow-prototype.md)记录最终选择。本评议保留比较时的观察，不决定批量写入或异常恢复语义。
