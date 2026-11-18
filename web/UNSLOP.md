# Default Apps 页面打磨

2026-11-18，范围为 `web/`。本次采用 unslop 的局部打磨模式，沿用已有品牌、真实截图、功能与段落顺序。

## 方向

- 产品：帮助 Mac 用户管理文件与链接的默认打开应用
- 性格：平实、准确、亲切
- 材质：暖白底、墨色文字与绿色强调，接近 Mac 工具的工作界面
- 重点：真实关联列表与批量设置预览
- 识别细节：沿用品牌句点，下载和当前选中状态使用绿色

## 原页面的问题

- 首屏：两块倾斜的彩色塑料底板增加了与产品无关的装饰
- 首屏：颗粒背景、模糊窗光与彩色大阴影争夺截图的注意力
- 按钮与标签：渐变填色、塑料内阴影和彩色投影使控制区过于突出
- 标题与页脚：统一使用 700 字重，层级过度依赖粗体
- 品牌与小标题：较小文字仍使用负字距
- 标题、引导与短说明：普遍带句号，部分标题未明确指出关联设置
- 功能与 FAQ：过大的段间留白削弱了内容分组
- 手机截图：将完整桌面窗口缩小后，界面文字难以阅读
- 320px 标签：五字标签换行，三个同级按钮高度不一致

原页没有装饰 emoji、虚构评价或运营数字，本次无需处理这些项目。

## 九个层次的调整

1. **间距。** 沿用 4px 网格；桌面段落留白收敛至 96/128px，手机为 64/80px。手机页边距统一为 24px，按钮与标签均为 48px 高；320px 标签保持单行。
2. **颜色。** 保留暖白与绿色品牌。辅助底色改为低饱和暖白，文字按主文、次文和辅助文字分工；边框为墨色的 10% 混合。移除彩色阴影、渐变填色与底板，截图浮层使用小幅中性阴影。
3. **图标。** 下载与 FAQ 的线性图标统一为 18px、1.5px 描边，继承文字颜色；真实应用图标继续留在原始截图中。
4. **文案。** 首屏明确说明文件与链接的打开应用，批量段落明确设置对象是关联。标题、引导和短说明去掉句号，多句说明保留标点。安装条件与功能事实沿用已有内容。
5. **字体。** 保留 Schibsted Grotesk、Instrument Sans 与中文系统字体，增加本地 Schibsted 500 字重，界面使用 400/500。降低标题尺寸，小文字取消负字距，数字使用等宽数字。
6. **布局。** 保留首屏与批量段落的左右布局、三种浏览入口与全部段落顺序。窄屏完整界面以 1280px 的可读尺寸放入滚动区域，手机批量预览以 700px 显示，避免继续压缩桌面文字；完整图片链接仍可直接打开。
7. **细节。** 截图圆角为 16px，控制为 8px。当前标签以中性底色与绿色底线标识，FAQ 加号统一为线图标。滚动截图可以聚焦并使用方向键，所有控制保留可见焦点。
8. **视觉。** 真实关联列表与批量预览承担视觉重点。删除颗粒、模拟窗光和倾斜塑料底板，保留原截图与手机首屏裁切，没有生成或替换产品数据。
9. **动态。** 使用一个缓动曲线，反馈为 160ms，FAQ 为 220ms，首屏一次性进入为 400ms/8px。标签悬停只改变底色，按钮按下缩至 98%，支持减少动态效果。

## 验证

- Chrome 下 320、390、768、1024、1440px：页面无横向溢出，主要标题、导航和控制位于边界内
- 320、390、768px 的三个标签与下载按钮均为 48px，标签不换行
- 标签点击、左右方向键循环、Home、End：选择、焦点和可见面板一致
- FAQ 点击展开与 Enter 折叠正常；Tab 首先到达跳转正文链接，焦点可见，Enter 跳转 `#main`
- 截图聚焦后支持方向键滚动；手机使用独立的首屏裁切
- 在独立浏览器的首次导航前拦截脚本：三个面板全部显示、标签隐藏，四个 FAQ 和两个下载入口保留
- 减少动态效果下，首屏动画缩短至 0.01ms
- axe-core 4.12.1：桌面展开 FAQ、手机和最终窄屏调整检查均为 0 violations、0 incomplete、29 passes（WCAG 2 A/AA 与 2.1 AA）
- 本地字体、图片和页内锚点存在；CSS 变量无未定义引用；`node --check web/script.js` 与 `git diff --check` 通过
- 视觉查看限于一次原页面截图、桌面与手机两次调整后截图；最后的窄屏行高及滚动区域修正通过 DOM 尺寸、键盘和可访问性复验

上述检查使用桌面 Chrome 与模拟视口，未覆盖 Safari 或实体手机。页面图片仍为真实前端配合隔离示例数据的捕获。

## 通用设计门禁

design-taste-frontend 的通用门禁同时要求整屏分节、特定 `.wrap`/导航骨架、预设动效和额外视觉素材。这些要求与本次 unslop 局部打磨的保留布局、减少装饰规则冲突；门禁结果单独记录，不声称通过该设计模板的检查。


最终运行结果：`GATE: FAIL 48 (round 2 of 3)`。没有使用 waiver，也没有为了通过门禁重套设计模板。

其中 `copy-fact` 未识别中文引导中已有的 Mac 平台事实，`hero-enter` 仅接受其约定标记，没有识别已有 CSS 一次性动画。其余主要涉及固定整屏、框架选择器、分栏顶对齐、额外素材和模板网格。unslop 局部模式要求 “Fix only what the audit found” 并保留已有布局；本次按用户指定的 unslop 约束处理，实际显示与交互检查单独验证。

<details>
<summary>门禁的 48 项原始记录</summary>

| 检查 | 位置 | 工具判定 |
| --- | --- | --- |
| `no-visual` | main#main > section.control-section.section "默认应用的改动， 范围与结果都清楚" | no picture, effect or mock in this section; a feature section needs a visual |
| `text-only` | section#questions "文件拖入、安装 与更新问题" | the section is only text: no picture, icon, mock or effect in it (2 sections like it at this width) |
| `text-only` | section#download "为下一次打开， 选好默认应用" | the closing section is only text: no picture, icon, mock or effect in it (2 sections like it at this width) |
| `copy-headline` | h1#hero-title "文件与链接， 用你选的应用" | "文件与链接， 用你选的应用" does not name what is sold (mac, from flags); only the line under it does |
| `copy-fact` | h1#hero-title "文件与链接， 用你选的应用" | the first screen holds no number, price, date, place, platform or genre |
| `section-tile` | section#questions "文件拖入、安装 与更新问题" | the section is 613px tall (0.68 screens at 1440x900), shorter than the screen: its tile (the screen from its top) shows 613px of it and 287px of the next section, its heading "为下一次打开， 选好默认应用" on screen |
| `hero-enter` | main#main > section.hero | the hero does not enter on load: no data-enter on the hero and no head line setting html.m-enter (motion.md, The hero's entrance) |
| `moment-none` | (the page) | a software page (--type) deals no moment: every kind carries one, two on a long page (moments.md) |
| `section-height` | footer.site-footer "Default Apps. 查看源码 反馈问题 版本记录 应用关联，在一处管理为" | the section is 272px tall (0.3 screens), 628px short of one screen (900px): every section after the hero is one screen or two, 2px either way (SR-2) |
| `section-height` | section#download "为下一次打开，选好默认应用 从 GitHub Releases 获取 Mac 安" | the section is 494px tall (0.5 screens), 406px short of one screen (900px): every section after the hero is one screen or two, 2px either way (SR-2) |
| `section-height` | section#features "从三个入口，管理默认应用 应用、文件类型或协议，任选一个入口 从应用出发 按文件" | the section is 1411px tall (1.6 screens), 389px short of two screens (1800px): every section after the hero is one screen or two, 2px either way (and 3 more like it: "文件拖入、安装与更新问题 拖入文件，会改动文件内", "默认应用的改动，范围与结果都清楚 修改范围、应用", "批量改关联，先预览，再设置 选好文件类型和应用，") (SR-2) |
| `section-height` | main#main > section.control-section.section "默认应用的改动，范围与结果都清楚 修改范围、应用副本、处理结果，分别说清楚 看清" | the section starts at 3188px, 412px above the screen grid (4 x 900px): sections start on whole screens (SR-2) |
| `one-section` | h2#control-title "默认应用的改动，范围与结果都清楚" | the screen at scroll 2700px (stride 3) shows 412px of section 4 and the heading of section 4 whole and the content of 2 sections, over 24px each beside section 3: a screen shows one section (another may peek 8px, 24px WARN) (SR-4) |
| `one-section` | h2#batch-title "批量改关联，先预览，再设置" | the screen at scroll 1800px (stride 2) shows 389px of section 3 and the heading of section 3 whole and the content of 2 sections, over 24px each beside section 2: a screen shows one section (another may peek 8px, 24px WARN) (SR-4) |
| `one-section` | main#main > section.control-section.section "默认应用的改动，范围与结果都清楚 修改范围、应用副本、处理结果，分别说清楚 看清" | the screen at scroll 3600px (stride 4) shows 314px of section 4 and the content of 2 sections, over 24px each beside section 5: a screen shows one section (another may peek 8px, 24px WARN) (and 5 more like it: scroll 3914px, scroll 4392px, scroll 3188px) (SR-4) |
| `one-heading` | h2#control-title "默认应用的改动，范围与结果都清楚" | headings of two sections show whole on one screen at 7 of 88 scroll positions (8%; at scroll 2500, 3900, 3950, 4000px), here with "批量改关联，先预览，再设置": at most 3% on a desktop (SR-5) |
| `container-edges` | a.skip-link "跳到主要内容" | a <a> at the top of the page, outside header.nav, main, footer.closing and nav.actionbar (SR-6) |
| `container-edges` | header.site-header "Default Apps. 功能 安装说明 GitHub" | a <header> at the top of the page, outside header.nav, main, footer.closing and nav.actionbar (SR-6) |
| `container-edges` | footer.site-footer "Default Apps. 查看源码 反馈问题 版本记录 应用关联，在一处管理为" | a <footer> at the top of the page, outside header.nav, main, footer.closing and nav.actionbar (and 7 more like it: "文件与链接，用你选的应用 为 Mac 的文件与链", "从三个入口，管理默认应用 应用、文件类型或协议，", "批量改关联，先预览，再设置 选好文件类型和应用，") (SR-6) |
| `split-pair` | main#main > section.hero > div.container.intro-layout "文件与链接，用你选的应用 为 Mac 的文件与链接，选好默认应用 获取 Mac " | the two columns of the split start 124px apart at the top (centred on each other): a split's columns are top-aligned, 8px either way (SR-8) |
| `split-pair` | main#main > section.batch-section.section > div.container.batch-layout "批量改关联，先预览，再设置 选好文件类型和应用，预览后逐项设置 换个搜索，勾选依" | the two columns of the split start 97px apart at the top (centred on each other): a split's columns are top-aligned, 8px either way (SR-8) |
| `split-pair` | section#download > div.container.download-layout "为下一次打开，选好默认应用 从 GitHub Releases 获取 Mac 安" | the two columns of the split start 22px apart at the top (centred on each other): a split's columns are top-aligned, 8px either way (SR-8) |
| `split-pair` | section#questions > div.container.faq-layout "文件拖入、安装与更新问题 拖入文件，会改动文件内容吗？ 不会。拖入用于识别文件类" | the split's columns are off the page's one pair of lines: its right column starts at x 583, the first split's at 603; its right column starts at x 583, on none of the split lines 621 (k=5), 732 (k=6), 843 (k=7) (SR-8) |
| `no-visual` | section#download "为下一次打开， 选好默认应用" | no picture, effect or mock in this section; a feature section needs a visual |
| `hole` | main#main > section.batch-section.section "批量改关联， 先预览，再设置" | an empty hole 160x312px inside the section (37% of the screen's height), with content above and below it |
| `edge-left` | section.hero div.product-stage | starts at x 602.9; the lines are 64 and the column starts |
| `edge-left` | section.hero figure.product-screen | starts at x 602.9; the lines are 64 and the column starts |
| `edge-left` | #features p.lead "应用、文件类型或协议，任选一个入口" | starts at x 736; the lines are 64 and the column starts |
| `edge-left` | section.batch-section.section div.batch-preview "滑动查看批量预览" | starts at x 583.1; the lines are 64 and the column starts |
| `edge-left` | section.batch-section.section figure.batch-screen | starts at x 583.1; the lines are 64 and the column starts |
| `edge-left` | section.control-section.section p.lead "修改范围、应用副本、处理结果，分别说清楚" | starts at x 736; the lines are 64 and the column starts |
| `edge-left` | #questions div.questions "拖入文件，会改动文件内容吗？ 不会。拖入用于识别文件类型，识别时" | starts at x 583.1; the lines are 64 and the column starts |
| `edge-left` | #download div.system-requirements "安装要求 处理器Apple Silicon 构建下限macOS " | starts at x 736; the lines are 64 and the column starts |
| `edge-left` | #download h3 "安装要求" | starts at x 777; the lines are 64 and the column starts |
| `edge-left` | #download dl "处理器Apple Silicon 构建下限macOS 13 安装" | starts at x 777; the lines are 64 and the column starts |
| `edge-left` | #download p "已在 Apple Silicon 环境验证，尚未验证全部 mac" | starts at x 777; the lines are 64 and the column starts |
| `screen-short` | section.hero section.hero "文件与链接，用你选的应用 为 Mac 的文件与链接，选好默认应用" | 812px tall; one screen under the nav is 900px |
| `neighbour` | #features section.showcase.section "从三个入口，管理默认应用 应用、文件类型或协议，任选一个入口 从" | framed, 261px of section.batch-section.section section.batch-section.section "批量改关联，先预览，再设置 选好文件类型和应用，预览后逐项设置 " shows |
| `screen-short` | section.batch-section.section section.batch-section.section "批量改关联，先预览，再设置 选好文件类型和应用，预览后逐项设置 " | 877px tall; one screen under the nav is 900px |
| `screen-height` | section.batch-section.section section.batch-section.section "批量改关联，先预览，再设置 选好文件类型和应用，预览后逐项设置 " | 877px, 0.97 screens; a section is exactly one or two (--h) |
| `neighbour-ground` | section.batch-section.section section.batch-section.section "批量改关联，先预览，再设置 选好文件类型和应用，预览后逐项设置 " | framed, 23px of section.control-section.section section.control-section.section "默认应用的改动，范围与结果都清楚 修改范围、应用副本、处理结果，"'s ground shows |
| `screen-short` | section.control-section.section section.control-section.section "默认应用的改动，范围与结果都清楚 修改范围、应用副本、处理结果，" | 726px tall; one screen under the nav is 900px |
| `screen-height` | section.control-section.section section.control-section.section "默认应用的改动，范围与结果都清楚 修改范围、应用副本、处理结果，" | 726px, 0.81 screens; a section is exactly one or two (--h) |
| `neighbour` | section.control-section.section section.control-section.section "默认应用的改动，范围与结果都清楚 修改范围、应用副本、处理结果，" | framed, 46px of #questions section.faq-section.section "文件拖入、安装与更新问题 拖入文件，会改动文件内容吗？ 不会。拖" shows |
| `screen-short` | #questions section.faq-section.section "文件拖入、安装与更新问题 拖入文件，会改动文件内容吗？ 不会。拖" | 613px tall; one screen under the nav is 900px |
| `neighbour` | #questions section.faq-section.section "文件拖入、安装与更新问题 拖入文件，会改动文件内容吗？ 不会。拖" | framed, 115px of #download section.download-section.section "为下一次打开，选好默认应用 从 GitHub Releases " shows |
| `neighbour` | #download section.download-section.section "为下一次打开，选好默认应用 从 GitHub Releases " | framed, 272px of the footer shows |
| `hero-fold` | section.hero section.hero "文件与链接，用你选的应用 为 Mac 的文件与链接，选好默认应用" | starts at y 88, not under the nav |

</details>

## 素材与归属

没有使用图片生成服务，也没有新的图片提示词。现有截图及其尺寸见 [README](README.md)，字体沿用本地 OFL 许可。

本次流程参考 [unslop](https://heydamir.design/unslop)，作者 Damir Sokolovsky（[@heydamir](https://x.com/heydamir)），CC BY 4.0；原始技能位于 `/Users/sunven/.agents/skills/unslop/SKILL.md`。
