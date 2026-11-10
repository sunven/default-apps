# 本工具更新交付验证 · 2026-11-10

已实现 Go/Wails 更新服务、软件更新界面、业务退出门控、统一版本与 GitHub 标签发布流程。未推送标签、上传 Release 或修改远端仓库可见性。

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| Go 全套 race 测试 | 通过，含更新服务、真实引擎校验、退出门控及既有关联功能 | [go-tests.log](go-tests.log) |
| Go 静态检查 | 通过 | [go-vet.log](go-vet.log) |
| React 全套测试 | 10 个文件、109 项通过 | [frontend-tests.log](frontend-tests.log) |
| 正式前端及应用构建、发布 ZIP 打包 | 通过，ARM64、ad-hoc 完整性与 ZIP 结构检查成功 | [final-build.log](final-build.log) |
| GitHub Actions 静态检查 | Actionlint 1.7.7 通过 | [actionlint.log](actionlint.log) |
| 版本同步与标签约束 | 在临时副本设置 0.1.1 并校验通过；v0.1.2 不匹配时拒绝 | 本次本机检查；`scripts/version.mjs` |
| 原生端到端升级 | 通过：隔离副本 0.1.0 → 0.1.1 | [native-check.log](native-check.log)、[native-results.json](native-results.json) |
| 正式产物隔离 | 不包含更新源覆盖、手动验收或 MCP 控制环境变量；正式版本为 0.1.0 | [artifacts.json](artifacts.json) |
| GitHub 正式发布 | 未执行；仓库必须先开放匿名读取 | [发布指南](../../docs/releasing.md) |

原生验证使用生产前端和更新引擎，仅通过编译标签添加本地源与验收控制；测试能力不进入普通产物。没有调用任何日常文件类型或 URL 协议的系统 setter。测试配置路径隔离，更新过程没有创建或改写关联配置。

原生验证依次确认：启动只请求版本与校验文件，损坏 ZIP 因摘要不匹配而被拒绝；正常重试后保持待安装；关闭更新对话框仍运行旧版；最终确认后旧进程退出，当前路径的 `.app` 被替换，新窗口与 plist 都显示 0.1.1，完整性检查通过。

截图：[发现新版](native-available.png)、[接近最小尺寸](native-resize.png)、[校验失败](native-checksum-error.png)、[待安装](native-ready.png)、[最终确认](native-confirm.png)、[升级后](native-upgraded.png)。原生内容尺寸实际观察为 1180×800 与 1001×701，均无横向溢出；早期验收脚本严格等待宽度不超过 1000 而超时，改为记录实际内容尺寸后完成主路径。

结果未定修改和助手准备失败由 Go／React 测试覆盖，本次原生升级没有制造系统待决修改。框架恢复不包含断电事务或新版本崩溃自动回滚。

复现原生验证需要先正常构建，再运行 `python3 .scratch/automatic-updates/build-smoke.py` 和 `python3 .scratch/automatic-updates/check-native.py`。前者通过 Go overlay 生成两个测试版本，不改工作区正式版本；后者启动隔离本地 HTTP 源与测试应用并点击真实界面。运行中的测试副本和控制目录被本目录的 `.gitignore` 排除。

工作区已有 Wails 开发监听，曾与构建过程同时改写前端依赖目录，导致中途出现依赖缺失。最终构建和检查期间仅暂时暂停监听进程，结束后恢复；未终止既有开发应用或 Vite 服务。最终结论以 `final-build.log`、`go-tests.log`、`frontend-tests.log` 为准。
