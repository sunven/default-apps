# 06: 单项修改的完整请求流程

**What to build:** 用户明确选择具体应用副本后，界面立即跟踪这一项修改，分别呈现受理、系统返回和实际回读；等待期间仍可浏览与查询。通过正式界面、Go 服务和可控适配器完整验证这一流程，真实系统写入由 09、10 接入。

**Blocked by:** [05: 手动补充并跨启动保存](05-manual-items-persistence.md).

**Status:** resolved

- [x] 应用关联行和候选详情均能明确提交单项修改，目标包含规范副本路径；三种浏览入口共享 Go 持有的请求与观察。无暂存、批量、恢复、停止等待或撤回按钮。（WRITE-1）
- [x] 受理前检查关联可解析、目标应用可用及写入门控，重新查询默认。默认与用户查看时不同时返回新观察并要求再次明确选择；目标已是当前具体副本时返回无需修改；校验或查询失败不调用 setter。（WRITE-2）
- [x] 明确提交生成客户端请求标识；相同标识与相同参数返回已有请求，同标识不同参数返回冲突。连点、重复提交和其他关联并发提交不会产生重复 setter；全局只允许一个活请求。（WRITE-3）
- [x] 使用 05 的存储机制，在原生提交前原子保存单条未定记录，含请求标识、关联、目标副本、提交前默认、阶段和时间；保留手动配置。保存失败明确显示未提交，setter 调用次数为 0。（STORE-2）
- [x] 受理返回请求快照，不等待系统确认；已受理与已实际提交可区分。系统 completion、回读和最后有效观察分别保存，事件与快照带身份和单调版本，为 07 的交错与重载处理提供依据。（WRITE-1、SYNC-1）
- [x] 只有 completion 成功且回读规范路径匹配目标，才确认本次修改；另一同 bundle ID 副本、旧值和其他应用展示目标与实际差异。查询到目标不能单独结束仍待决的请求，也不能触发自动重发。（WRITE-4）
- [x] completion 错误保留原生 domain、code、description，并独立回读；不推测取消、没有改动或回滚。回读失败保留最后有效观察及重查入口，在得到有效回读前继续阻止新写入；重查只调用查询。（WRITE-5）
- [x] 已知系统结果与有效回读呈现后清除未定记录并结束该次门控；清除失败分别展示已知结果和存储问题，不改写成系统修改失败。正常清除和错误清除均保留手动配置。（STORE-3）
- [x] 全局请求状态显示原关联、目标完整路径和阶段，可返回请求项；任一请求待决或回读未确定时禁用所有新写入，搜索、切换与查询仍可用。1000×700 下等待条、应用信息、搜索与列表动作可达，后续与 04 的完整浏览界面组合验收。（UI-2、WRITE-3）
- [x] Go 请求生命周期独立于绑定调用等待和前端监听；不按时限宣布成功、失败或撤回。可控适配器能够延迟 completion、返回错误和不同回读，以正式服务状态驱动界面。（WRITE-6）
- [x] 用 Go 规则与正式界面集成验证正常成功、全部提交前分支、同标识冲突、跨关联忙状态、副本不匹配、错误／回读失败、保存／清除失败，断言 setter 次数及磁盘记录；验证无需真正改变系统默认。
- [x] 可控适配器通过测试环境注入，生产界面不含演练开关，也不把替身结果冒充系统事实；在 07、08 完成并由 09 接通之前，生产写入保持不可提交。（BUILD-2）

依据：[实施入口](../spec.md)、[修改语义最终决议](../../default-apps-v1/issues/05-change-semantics-prototype.md#answer)、[架构方案](../../default-apps-v1/assets/architecture-proposal.md)、[验收矩阵](../../default-apps-v1/assets/acceptance-criteria.md#验收矩阵)。

## Comments

- 2026-11-06：从 integration/default-apps-v1 的 33bfcc9 开始，认领完整 06；使用已确认的 Go 服务、共享配置、正式 React／Wails 界面 seams，逐条 red → green。真实 setter 仍留给 09／10。

- Red → green evidence: first service test failed because the change package did not exist; unresolved identity and unknown-view tests then failed until fresh catalog/preflight checks existed. Concurrent identical retry test exposed nil request data before admission finished; it now shares the complete result. Completion-observation test exposed missing shared readback state. Nested accepted preflight mutation exposed a shallow-copy leak; all public replies/events are now defensively copied. The UI initially had no Changes module; later the lost-reply test proved one empty snapshot must not reopen writes. Each focused failure was corrected before broader checks.
- Formal native controlled evidence and production build were rerun after fixes; latest integration cf32692 merged with only the claimed/resolved tracker conflict, retained resolved after evidence review.

## Answer

Implemented the single-change lifecycle across the shared Go store, public Wails service/event boundary, generated React bindings, and formal desktop UI. The coordinator performs fresh identity/availability/default preflight, global admission and same-ID idempotence, persists the single opaque pending record before dispatch, retains accepted/submitted/completion/readback as distinct facts, confirms only nil native error plus valid exact target path, preserves native error fields, and makes readback retry query-only. Production builds expose no writable kinds and use a disabled dispatcher; only the isolated `change_smoke` build injects the controlled adapter.

Evidence: `assets/06/change-final-test.log` and `go-test.log` pass `go test -race ./internal/change` (16 tests) and all repository Go tests. `assets/06/frontend-test.log` passes 32 React tests; `frontend-build.log` passes TypeScript/Vite production build. The formal Wails controlled adapter ran on MCP port 9107 with isolated config root and generated bindings. `native-lifecycle.json` covers accepted before dispatch, submitted, target observation while pending, exact confirmation, different-copy mismatch, native error plus failed readback, and readback-only retry. `native-boundaries.json` covers changed default, already-target no-op, unavailable target, query failure, unresolved identity, save failure with zero setter starts, clear failure with known result, replacement of leftover pending data, and return-to-request-item. `native-summary.json` summarizes 17 scenarios. `native-minimum.json` and `native-pending-minimum.png` show actual 1000×700 webview, zero horizontal overflow, both independent scroll regions, status/search/list controls reachable and writes disabled while pending. `baseline-check.json` compares 21 independent native association queries before/after and records no native setter. `a11y.json` reports zero axe violations. `visual-inspection.log` reports 0 FAIL/1 tiny-text warning and `visual-lint.log` reports 0 warnings.

The existing 04/05 browser and manual tests remain green. `HANDOFF.md` documents the public coordinator/store boundary, native dispatcher contract, production exclusion, and explicit 07/08 follow-up gaps.
