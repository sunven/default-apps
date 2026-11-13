# 标签切换性能回归（调试夹具）

2026-11-13。生产入口配独立只读服务夹具，811 个文件类型、162 个 URL 协议；所有系统修改调用均不可用。这些脚本和夹具不进入产品构建。

原因：切换时同步挂载整个目录的富文本单元格、按钮和复选框。查询立即返回的夹具仍然卡顿，Chrome 跟踪中 JavaScript 执行占主要耗时，布局计算次之。原有表格库的虚拟化不接受自定义换行单元格，因此接入 TanStack Virtual 测量实际行高，继续通过 Astryx Table 插件输出原生表格及空白占位行。完整目录仍用于搜索、批量选择、查询和键盘导航。行高观察在下一动画帧更新，避免测量回调反复触发布局；浏览器和 WKWebView 交互脚本均检查未捕获错误。

macOS WKWebView，1200 × 800，生产构建，点击到两次 requestAnimationFrame 的耗时（每方向三次）：

| 切换目标 | 修复前 | 修复后 |
| --- | --- | --- |
| 文件类型 | 685–813 ms，811 行 | 33–53 ms，13–15 行 |
| URL 协议 | 164–191 ms，162 行 | 19–45 ms，15 行 |

原始结果见 `webkit-before.json` 与 `webkit-after.json`。这是同一组件在压力夹具中的对比，不是用户实际系统目录的端到端测量。

验证通过：

- 141 项前端测试；新增回归测试先报 `expected 800 to be less than 40`，修复后通过。覆盖有界挂载、逻辑行位置、End 跳转到未挂载末项、详情、全选全部结果和筛选后保留勾选。
- WKWebView 中 Home/End 导航、文件列表 12000 / 协议列表 3000 的独立滚动位置恢复、可见行连续、全选 811 项，见 `webkit-interactions.json`。
- WKWebView 中首行从 60 增高至 273 像素后，滚动至 0、100、3000、18000 再返回，列表没有空白或重叠，见 `webkit-wrapping.json`。
- TypeScript 与产品生产构建通过；Astryx doctor：20 通过、0 失败，保留原有外部字体的两项警告。

重新验证：

```sh
npm --prefix frontend test -- src/App.performance.test.tsx
cd frontend
./node_modules/.bin/vite build --config ../.scratch/tab-performance/vite.config.mjs --configLoader native --outDir ../.scratch/tab-performance/dist --emptyOutDir
```

从仓库根目录在独立终端启动只读预览：

```sh
python3 -m http.server 9257 --bind 127.0.0.1 --directory .scratch/tab-performance/dist
```

然后运行：

```sh
swiftc .scratch/tab-performance/check-webkit.swift -o /tmp/default-apps-tab-check
/tmp/default-apps-tab-check http://127.0.0.1:9257 .scratch/tab-performance/measure.js
/tmp/default-apps-tab-check http://127.0.0.1:9257 .scratch/tab-performance/interactions.js
/tmp/default-apps-tab-check http://127.0.0.1:9257 .scratch/tab-performance/wrapping.js
```

每项输出 `pass: true`。测量脚本把任一次超过 100 ms 视为失败。机器负载会影响绝对耗时；Vitest 使用挂载行数验证这一卡顿模式，避免依赖墙钟计时。
