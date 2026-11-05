# 01: 正式窗口与 PDF 默认查询

**What to build:** 用户启动正式 macOS 应用后，可以查看 PDF 的系统当前默认应用与候选应用，看到每个具体副本的名称、版本和完整路径。这条最小可运行路径同时建立后续功能使用的产品身份、构建与原生查询边界。

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] 普通与开发 `.app` 均能在已确认的 macOS 27.2／Apple Silicon 自用环境启动；名称、描述、模块标识与稳定 bundle identity 对齐，采用本机 ad-hoc 签名。（BUILD-1）
- [ ] 固定 Go 1.27.3 和 Wails CLI／Go 模块／前端 runtime 3.1.0，构建前检查版本；使用现有前端锁文件与 npm ci，保留 React 18。Darwin 编译、链接和两份 plist 的部署下限统一为 macOS 13，说明这只是构建下限。（BUILD-1）
- [ ] 用户从正式窗口查看 PDF，真实查询通过 React、Wails 生成绑定、Go 服务、薄 cgo／Objective-C 适配器到达公共 NSWorkspace／UTType 接口，再返回可呈现的数据；首次原生访问发生在应用壳可调度之后。（QUERY-1）
- [ ] 当前默认与候选独立查询；副本以规范应用包路径识别，保留显示路径与 bundle ID 元数据。即使查询结果位于扫描范围外，也能展示；不得按 bundle ID 或统一小写路径合并不同副本。（QUERY-1、CAT-4）
- [ ] 查询中、成功无默认、候选为空与查询失败各有明确呈现；重查失败保留最后有效观察并标明待更新，重查不调用 setter。（QUERY-2）
- [ ] 系统适配器可替换，以便确定性验证查询结果与错误；跨原生边界返回 Go 可拥有的数据，遵守线程与内存所有权约定。界面不直接调用系统 API。
- [ ] 正式窗口采用产品标题，最小内容区域按 1000×700 设置并实测，原生标题栏另计；本项先交付 PDF 查询，应用优先目录由 03 接入，完整桌面浏览由 04 完成。（UI-2）
- [ ] 生产入口与构建产物移除问候服务、示例时钟及演示内容，不包含原型入口、演练控制栏、压力数据或独立探针；正式功能不依赖原型开发参数。（BUILD-2）
- [ ] 留下普通／开发构建启动和 PDF 只读查询证据；对照原生查询路径，并用替身覆盖空结果、错误及最后有效观察。PDF 默认保持只读；此阶段正式产品尚未接通 setter。

依据：[实施入口](../spec.md)、[架构方案](../../default-apps-v1/assets/architecture-proposal.md)、[验收矩阵](../../default-apps-v1/assets/acceptance-criteria.md#验收矩阵)。
