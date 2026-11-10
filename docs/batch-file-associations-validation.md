**批量设置实现与验收 · 2026-11-10**

已实现文件类型页多选、共同目标应用选择、逐项预览和执行、停止后续设置、分类结果、重新处理问题项，以及最近一批的保存与明确恢复。正式产物是 `bin/Default Apps.app`，版本仍为本地开发中的 `0.1.4`，未发布新版。

实现依据是用户逐项确认的[批量设置规格](batch-file-associations.md)。后端持有批次执行与写入互斥，前端重载只读取进度；系统完成和可信回读匹配目标副本后才计为成功。批次项与未定请求一起保存，结果与清除未定记录一起提交；保存错误暂停后续操作。

**验证结果**

环境：macOS 27.2.1 / Apple Silicon，Go 1.27.3、Wails 3.1.0。以下层级分别记录。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| Go 全量竞态测试 | 通过 | [测试日志](../.scratch/batch-settings/evidence/go-tests.log) |
| React / 交互测试 | 115 项通过，包含新增批量流程和旧批次通知回归 | [测试日志](../.scratch/batch-settings/evidence/frontend-tests.log) |
| TypeScript 与生产前端构建 | 通过 | [构建日志](../.scratch/batch-settings/evidence/frontend-build.log) |
| 正式 `.app` 打包及 ad-hoc 签名核验 | 通过 | [打包日志](../.scratch/batch-settings/evidence/package.log) |
| 真实 Wails 窗口＋受控系统边界 | 通过多项串行、失败后继续、停止、前端重载、退出重开、未知旧请求恢复确认 | [结果记录](../.scratch/batch-settings/evidence/controlled-results.json)、[验收脚本](../.scratch/batch-settings/check-native.py) |
| 桌面最小尺寸 | 实测内容区 1001×701，无横向溢出；1180×800 也无溢出 | [预览截图](../.scratch/batch-settings/evidence/preview-4.png)、[部分结果截图](../.scratch/batch-settings/evidence/partial-results.png) |
| 真实 macOS 批次完成 | **尚未观察到完成回调**，未计为成功 | [真实尝试记录](../.scratch/batch-settings/evidence/real-attempts.json)、[真实系统脚本](../.scratch/batch-settings/check-real.py) |
| 真实尝试后的日常关联与专用类型清理 | 日常默认与候选集合前后相同；专用类型无残留默认／候选 | [尝试记录](../.scratch/batch-settings/evidence/real-attempts.json)、[清理记录](../.scratch/batch-settings/evidence/fixture-cleanup.json) |

真实系统尝试使用新建的两个专用文件类型和惰性应用包，确实走到了主线程 NSWorkspace setter；首项未收到完成回调，第二项保持未执行。一次尝试持续约 70 秒，另一次在窗口激活后验收控制调用超时；辅助访问尝试也未能取得可操作的系统确认按钮，后续访问返回权限错误。这个接受窗口只属于测试脚本，产品没有超时后自动判失败或跳到下一项的逻辑。没有将受控系统测试当作真实 macOS 批次设置成功的证据。

**已覆盖的重要边界**

- 先保存后调用 setter；回读早于系统完成时，即使已看到目标也不进入下一项。
- 已是目标无需调用 setter；默认在预览后发生变化时跳过；系统明确拒绝且回读可信时保留失败并继续。
- 停止后当前已提交项仍按实际结果处理，剩余项不再提交。
- 重开不自动继续、不重放旧请求；旧请求当前值匹配目标仍保留未知，新的修改需要明确恢复确认。
- 前端重复点击与丢回复只核对原批次身份；核对到未存在的原操作会关闭该开始凭据，迟到调用不能执行。
- 配置写入前失败、rename 后同步失败、结果保存失败分别测试；同进程重试会先读取持久的不确定证据。
- 批次期间统一阻止其他修改；重启安装提示期间暂停推进，取消重启后继续。
- 配置从版本 1 在首次保存批次时升到版本 2，保留手动项、应用位置与原未定记录；普通手动项更新不会覆盖批次。
- 旧批次的完成项不会在开始新批次后重复弹出单项成功通知。

**产物**

`bin/Default Apps.app/Contents/MacOS/default-apps` 的 SHA-256：

```text
9d4ec97f9a194e8d1712cba03623acfec98f506b457df1f5af4c92d0df7fd7d4
```

可用 `open "bin/Default Apps.app"` 启动，在“文件类型”页勾选后点击“选择应用…”。本轮已启动正式产物并核对进程路径；自动化桌面流程及截图来自隔离配置的验收产物。真实系统批次成功、真实拒绝后继续等平台组合场景仍需要取得实际完成回调后的进一步验收。
