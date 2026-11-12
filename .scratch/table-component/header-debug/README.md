# 固定表头顶边漏字回归

2026-11-12。使用真实应用入口和独立只读预览夹具，在 macOS WKWebView 窗口中验证。

原因：当滚动容器顶边为小数坐标时，WebKit 的实际窗口合成画面可能在固定表头上方露出一条行内容。Chrome 截图和 WKWebView.takeSnapshot 都未复现；必须用 screencapture 捕获所属窗口。更换合并边框、把 sticky 移到 th、给 thead 加阴影均无效。给 `.association-list` 增加 `clip-path: inset(0)` 后修复。

`compositor-before-screen.png` 在 y=215 的顶边检出 59 个行内容像素；`fixed-screen.png` 同位置为 0。应用关联、文件类型、URL 协议及文件类型深色模式的窗口像素检查通过。协议夹具只有两项，脚本将该列表视口限制为 6rem，以触发真实表格滚动。浏览器勾选、详情关闭后的焦点恢复和方向键浏览通过；表格 axe 检查 0 违规。生产构建通过，Astryx doctor 20 通过、0 失败，保留原有外部字体的 2 项警告。

重新验证（macOS，需要 Swift 和窗口截屏能力；不执行系统关联修改）：先在另一个终端从 frontend 启动现有预览。

```sh
cd frontend
./node_modules/.bin/vite --config ../.scratch/astryx-theme-preview/vite.config.mjs --configLoader native
```

再从仓库根目录运行：

```sh
swiftc .scratch/table-component/header-debug/check-header.swift -o /tmp/default-apps-header-check
/tmp/default-apps-header-check 1200 500 .scratch/table-component/header-debug/validate.js /tmp/header-file.png light file
/tmp/default-apps-header-check 1200 500 .scratch/table-component/header-debug/validate.js /tmp/header-app.png light app
/tmp/default-apps-header-check 1200 560 .scratch/table-component/header-debug/validate.js /tmp/header-scheme.png light scheme
/tmp/default-apps-header-check 1200 500 .scratch/table-component/header-debug/validate.js /tmp/header-dark.png dark file
```

每项须输出 `PASS: 0 row-content pixels above the header`。脚本会短暂打开独立窗口，按窗口 ID 截图后退出。输出图保留用于人工复核。

历史红灯与修复图可独立对比：

```sh
swift .scratch/table-component/header-debug/edge-check.swift .scratch/table-component/header-debug/compositor-before-screen.png 215
swift .scratch/table-component/header-debug/edge-check.swift .scratch/table-component/header-debug/fixed-screen.png 215
```

第一条预期失败（退出码 1），第二条预期通过。
