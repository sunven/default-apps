# Default Apps 网站

独立的中文静态产品页，采用 Hallmark 的 Dose white 主题。面向管理 Mac 文件和链接打开方式的用户，下载入口指向项目的 GitHub Releases。

## 本地预览

在仓库根目录运行：

```sh
python3 -m http.server 4327 --bind 127.0.0.1 --directory web
```

浏览器打开 `http://127.0.0.1:4327`。网站无需 npm 安装、构建步骤或后端服务。

部署时复制 `index.html`、`styles.css`、`tokens.css`、`base.css`、`script.js` 和 `assets/` 到静态托管目录，保留相对路径；无需发布 `.hallmark/`。当前未配置生产域名，也未部署线上站点。

## 文件与交互

- `index.html`：首屏、三种浏览入口、批量设置、修改范围、FAQ、下载与兼容性说明。
- `tokens.css`：Dose 的颜色、字体、尺寸、间距和材质变量。
- `base.css`、`styles.css`：基础样式、页面布局、断点与减少动态效果支持。
- `script.js`：截图标签切换与 `window.hallmarkSlots()` 素材替换入口。
- `assets/licenses/`：本地 Instrument Sans 和 Schibsted Grotesk 字体的 OFL 许可；中文使用系统字体。

截图标签支持点击、左右方向键、Home 和 End。关闭 JavaScript 时，三个界面按顺序展示，FAQ 仍通过原生 `details` 展开。下载与项目链接直接打开 GitHub。

## 素材与替换

界面图片来自本仓库真实前端，通过隔离的示例服务数据捕获；它们不是原生 macOS 系统操作的验收证据。没有使用用户私人文件、虚构用户评价或运营指标。图标来自仓库已有应用资源。

| 位置 / slot | 文件 | 像素尺寸 | 内容 |
| --- | --- | --- | --- |
| 首屏 / `hero` | `assets/hero.webp` | 1936 × 1356 | 预览应用与文件关联列表 |
| 手机首屏 / `hero` 的 picture source | `assets/hero-mobile.webp` | 840 × 900 | 同一界面的手机裁切 |
| 应用 / `applications` | `assets/applications.webp` | 2560 × 1600 | 已安装应用与所选应用关联 |
| 文件类型 / `files` | `assets/files.webp` | 2560 × 1600 | 文件类型与默认应用 |
| URL 协议 / `protocols` | `assets/protocols.webp` | 2560 × 1600 | 网页、邮件链接的默认应用 |
| 批量预览 / `batch` | `assets/batch.webp` | 1400 × 1096 | 三项选择：PDF 待修改，JPEG、PNG 已是目标 |

可直接替换同路径文件；改变比例时同步更新 HTML 尺寸和 CSS 的 `aspect-ratio`。首屏桌面和手机文件需分别替换，以保留手机裁切。最有价值的后续素材是最终发布版在真实 Mac 上的批量预览截图，可替换现有示例数据捕获。

## 验证

验证日期：2026-11-14。结果见 [检查记录](.hallmark/validation.md)。Hallmark 检查可从仓库根目录运行：

```sh
node .agents/skills/hallmark/scripts/sloplint.mjs web --genre modern-minimal --render
```

渲染检查需要 Chrome 和 `puppeteer-core`。当前本地检查依赖位于被忽略的 `web/.hallmark/tools/`，可用环境变量 `HALLMARK_PUPPETEER` 指向它；它不是网站运行依赖。
