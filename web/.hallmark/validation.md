# 网站检查记录

2026-11-14，范围为 `web/` 静态网站；未修改桌面应用源码，未执行系统默认应用变更。

## 机械检查与交互

- Hallmark 静态及 Chrome 渲染：0 FAIL、0 REFLEX、0 WARN。
- 320、375、390、768、820、1024、1280、1440、1920px：无横向溢出，图片加载正常，导航标签不换行。桌面首屏主操作位于视口内。
- 标签点击、ArrowLeft / ArrowRight 循环、Home / End：选中状态、焦点与显示面板一致。
- Tab 首次到达跳转正文链接，Enter 跳转 `#main`；FAQ 支持鼠标与键盘展开、折叠。
- `prefers-reduced-motion: reduce`：首屏动画压缩至 0.01ms。
- 独立浏览器页面禁用 JavaScript：三个面板全部显示、标签控件隐藏、首屏内容可见，375px 无溢出。
- `node --check web/script.js` 通过，本地 HTML 资源与页内锚点存在。
- axe-core 4.12.1：0 violations、28 passes；1 项 contrast incomplete，涉及 5 个有材质或渐变背景的节点。补查颜色配对：首屏标题 16.44:1、正文 12.15:1、按钮文字在渐变两端分别为 5.33:1 / 7.57:1；Hallmark 渲染对比度检查通过。

## 视觉审查

Hallmark 的独立 finish review 返回 `fix`。三项主要发现已处理，并由主代理复核重新生成的截图：

1. 批量预览原先为 0 项待处理，已重新捕获真实前端：PDF 从 Chrome 改为预览，JPEG 与 PNG 已是目标，按钮显示“开始设置 1 项”。没有发起系统修改。
2. 修改说明标题改为“默认应用的改动，范围与结果都清楚。”，明确本页产品能力。
3. FAQ 标题改为“文件拖入、安装与更新问题。”，明确问题范围。

同时将次要 CTA 改为“查看功能”、兼容性标题改为“安装要求”。保留 Dose 暖纸底、绿色控制和产品界面。前一会话已按 hero review 为手机准备独立裁切，本轮继续保留。

design-taste-frontend gate 返回 `GATE: OFF (no build active)`；本页是用户明确指定的 Hallmark Dose 构建，未声称通过另一套设计系统的门禁。

## 范围与限制

浏览器检查使用 macOS 上的 Chrome；没有声称经过 Safari、Firefox 或实体手机验证。界面图片使用隔离示例数据，替换建议及尺寸见 `../README.md`。未配置生产域名、社交分享绝对图片地址或自动部署；未提交、推送或发布。
