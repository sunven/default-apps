# 10: 真实 URL 协议修改

**What to build:** 用户可以独立修改某个 URL 协议的默认应用，沿用文件类型已有的提交、等待、回读和恢复体验；专用测试协议取得真实成功，证明协议接口已接入正式产品。

**Blocked by:** [09: 真实文件类型修改](09-native-file-type-change.md).

**Status:** in-progress

- [ ] 复用 09 已验证的原生请求所有权与 Go 生命周期，接通公共协议 setter；每次提交只包含一个规范 scheme 和具体应用副本，继续执行预检查、去重、先保存再提交、回读与退出恢复。（WRITE-1、WRITE-2、STORE-2）
- [ ] 应用视角与协议视角共享同一关联的默认和请求状态；http 与 https 分别查询和修改，修改一个不生成另一个的隐式请求，日常协议仅做只读核对。（QUERY-1、WRITE-1）
- [ ] 文件类型与协议共用全局写入门控，任一类待决或回读未确定时，另一类也不能提交；等待期间仍可浏览与查询。（WRITE-3）
- [ ] 协议同样只有 completion 成功加精确规范路径匹配才确认；错误、不同副本、旧值及回读失败按现有规则呈现，NSError 字段保持真实，不新增未经观察的取消映射或自动重试。（WRITE-4、WRITE-5）
- [ ] 通过正式应用将独立专用协议从 A 改为 B，取得至少一项真实成功 completion 及匹配回读，再明确改回可用 A；记录关联、具体路径、用户动作、系统提示和完整结果，不依赖历史独立探针。（WRITE-1、WRITE-4）
- [ ] 以规则与界面验证跨文件类型／协议的并发阻止、scheme 身份隔离、错误与回读差异；复核协议请求在前端重载、等待及恢复场景中遵守同一生命周期。（WRITE-3、WRITE-5、WRITE-6）
- [ ] 实验保持日常浏览器、邮件等协议默认只读，核对前后基线，只清理此次专用夹具并处理残留；系统是否接受未声明应用及是否提示按观察记录，不承诺所有协议都能强制改写。

依据：[实施入口](../spec.md)、[修改语义最终决议](../../default-apps-v1/issues/05-change-semantics-prototype.md#answer)、[架构方案](../../default-apps-v1/assets/architecture-proposal.md)、[验收清单与原生记录要求](../../default-apps-v1/assets/acceptance-criteria.md)。

## Comments

- 2026-11-06: Fresh implementer claimed at integration `ae714e2` (09 code `0077afc`); independent 09 merger confirmed PASS. Applying agreed public service, native external-boundary and production React/Wails seams. Reuse 06–09 lifecycle evidence; add focused scheme/cross-kind checks and fresh dedicated real scheme A→B→A with human-only system consent.

- TDD: production-capability test failed with `[file]`, then green after enabling both kinds. Scheme dispatcher test failed with native-unavailable before queue, then green with actual C→Go callback/error copying. Added independent service regression cases for http/https identity, bidirectional shared gate (existing file→scheme plus new scheme→file), exact-path/error/readback combinations; these already-passed lifecycle rules required no coordinator change. First new readback test stopped before asynchronous disk clear, causing temporary-directory cleanup races; fixed harness to await the public settled gate. Existing accepted TDD seams remain unchanged.
