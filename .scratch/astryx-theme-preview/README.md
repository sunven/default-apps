# Butter 主题预览

使用真实的 `frontend/src/main.tsx` 和应用组件，以独立 Vite 配置替换 Wails 服务边界。列表使用示例数据和仓库已有的应用图标；系统修改、文件选择及更新操作均不可用。正式构建不引用这些夹具。

从 `frontend/` 启动：

```sh
./node_modules/.bin/vite --config ../.scratch/astryx-theme-preview/vite.config.mjs --configLoader native
```

预览地址：`http://127.0.0.1:9256/`。切换“全部”应用可查看预览、文本编辑等示例；配色跟随系统深浅色。

直接使用 `@astryxdesign/theme-butter@0.7.14` 的内置主题，包括暖黄色背景、蓝色强调色、字体、圆角和深色模式。通过 `theme add butter` 和 `theme use butter` 接入，没有 eject，也没有复制或覆盖主题调色板。已移除旧 Matcha 定制主题及其依赖。

`src/astryx-themes.ts` 由 CLI 管理，默认使用 `butter`；应用入口只导入一次 `themes` 与 `defaultThemeSlug` 并传给 `Theme`。直接消费包里的构建产物，无需本地主题编译。应用专属尺寸保存在 `app.css` 的布局变量中，方便直接切换主题。

界面调整：顶部工具按钮和列表辅助操作弱化边框；关联数量、搜索与来源筛选分层排列；选中行使用柔和的圆角底色；拖入文件提示移至底部。应用列表和关联列表保持独立滚动，保留查询、筛选、键盘导航和系统修改语义。

验证：128 项前端测试和生产构建通过；Astryx doctor 20 项通过、0 失败、2 项相关警告（详见 `butter-doctor.txt`）。两个警告均来自官方字体 CSS 的 Google Fonts 外部导入：CLI 无法静态确认字体是否加载。已在浏览器用 `document.fonts.load` 分别确认 Outfit、JetBrains Mono、Sarina 均成功加载；离线时使用主题自带的后备字体。

浏览器检查了 1280×820 的深浅色、1000×700 最小窗口和详情弹窗；最小窗口无页面或列表横向溢出，两个列表可独立滚动。浅色和深色 axe 检查均为 0 违规。此次使用浏览器示例数据验证界面，没有执行真实系统关联修改。

截图：`butter-light.png`、`butter-dark.png`、`butter-minimum.png`、`butter-dialog.png`。旧的 `macos-*.png` 和 `matcha-*.png` 保留作视觉对照。
