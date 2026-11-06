# 08：待决退出与重启恢复

2026-11-06，macOS 27.2 / Apple Silicon。正式 React、生成绑定、Go 服务、JSON 配置和 Wails 壳，系统修改边界使用 `change_smoke` 可控适配器。未调用任何真实系统 setter。原生菜单、键盘与窗口操作为进程内 AppKit 合成动作，不能替代 11 的真实待决系统修改退出实证。

| 层 | 结果与证据 |
| --- | --- |
| Go 服务 / 存储 | 27 个协调器测试及 `go test -race ./...` 通过：[日志](go-race.log)。新增覆盖旧记录未知、查询失败与明确确认门控、原子替换失败保留旧记录和手动配置、清除失败跨启动未知、旧 ID 不重放、单提示、过期响应、completion 期间提示、退出与保存竞争、晚到 callback 与正在进行的查询。 |
| React | 36 个测试通过：[日志](react-tests.log)。新增恢复警告的原目标 / 新目标、Escape / 返回零提交、明确提交携带旧 ID、查询失败禁写、退出提示与当前提示身份。生产前端构建通过。 |
| 正式 Wails 主运行 | [26 个场景原始记录](native-lifecycle.json)、[汇总](native-summary.json)覆盖 7 个真实进程。菜单 `performActionForItemAtIndex:`、⌘Q `performKeyEquivalent:`、最后窗口 `performClose:` 均进入产品 `ShouldQuit` / `WindowClosing`；重复操作只有一个提示。每个入口的留下和退出均通过，实际正常退出码 0；提示期间 completion 到达仍等待用户选择。 |
| 真正进程边界 | 主运行包含提交后 `SIGKILL` 和保存后、受控实际启动前 `SIGKILL`，退出码 -9。每次重新启动均保留原记录且自动启动数为 0。当前路径与旧目标相同 / 不同均保持旧请求结果未知。初始查询失败保持门控；明确新动作才替换记录。 |
| 旧请求外部影响 | [补充真实进程记录](native-external-change.json)通过：新请求待决时当前观察先为 `/Controlled/Other/Xcode.app`，随后受控外部变化回到 `/Applications/Xcode.app`；两次观察均无旧 / 新 completion，记录与实际启动数 1 保持一致。[日志](external-run.log)。 |
| 存储清除失败 | 主运行在本会话显示已确认结果和独立存储问题；正常退出、重开后遗留记录仍为旧结果未知，即使当前路径匹配。每次存储仍保留手动协议 marker。 |
| 原生焦点 / 最小窗口 | 原生 Shift-Tab 从关闭按钮回到“仍然退出”，Tab 回到关闭，Escape 留下；恢复警告原生 Escape 不提交。原生 contentLayoutRect 为 1000×700，WebView DOM 1001×701（与 04 同样的边界取整），横向溢出 0。 |
| 构建隔离 | [普通构建输入](production-inputs.json)不含 `change_environment_smoke.go`、`lifecycle_smoke.go` / `.m`、`manual_smoke` 或 MCP。普通 `production` 构建通过：[日志](production-build.log)。写入仍由禁用 dispatcher / 空 writableKinds 关闭，等待 09 / 10 接入。 |

[退出对话框](quit-dialog-1000x700.png)、[恢复警告](recovery-warning-1000x700.png)、[查询失败](recovery-query-failure-1000x700.png)、[清除失败](clear-error-1000x700.png)、[当前值匹配仍未知](recovery-current-matches-1000x700.png)均来自实际 WKWebView 像素快照。保留已选 A 布局、系统字体及共享 Dialog；本项没有改变目录布局。新增文字与动作完整可见，焦点可见，长路径可折行。正式 Wails 不是 CDP 浏览器，因此原生层使用既有 MCP / AppKit / WebKit 证据路径；没有以 Chrome 替代此层。

复现（工作树根目录）：

```sh
sh .scratch/default-apps-v1-implementation/assets/08/build-smoke.sh
python3 .scratch/default-apps-v1-implementation/assets/08/check-native.py
python3 .scratch/default-apps-v1-implementation/assets/08/check-external-change.py
```

端口 MCP 9109；隔离配置 `/Users/sunven/.codex/default-apps-implementation-20261105/change08-smoke`。主 runner 会重建该专用根的初始配置，且只控制自己启动的 PID。`starts` 是受控调度次数，`actualStarts` 是调用 submitted 表示实际启动的次数；保存后崩溃场景为前者 1、后者 0。此区分不声称操作系统实际收到过 setter。所有退出记录保留接受时的磁盘事实，不依赖退出 hook 或 `app.Run()` 返回后首次保存。
