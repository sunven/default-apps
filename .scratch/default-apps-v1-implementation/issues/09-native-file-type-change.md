# 09: 真实文件类型修改

**What to build:** 用户在正式应用中明确选择文件类型及具体应用副本后，可向 macOS 提交真实修改，持续查看系统处理与回读结果；专用测试类型证明这条完整路径能实际生效。

**Blocked by:** [07: 刷新、重载与晚到结果同步](07-refresh-reload-synchronisation.md), [08: 待决退出与重启恢复](08-quit-and-recovery.md).

**Status:** resolved

- [x] 在已有目录、修改协调器、持久化和退出流程内接通公共文件类型 setter；所有生产写入经过同一 Go 受理路径，不绕开去重、预检查、未定记录或门控。07、08 的确定性验证通过后才启用真实文件类型写入。（WRITE-1、WRITE-2、WRITE-3、STORE-2）
- [x] 使用公开 Wails 主线程调度，仅在主线程发起短小原生调用，等待系统期间界面可用；复用现有 AppKit run loop，不修改 Wails 内部实现或另建主循环。（WRITE-6）
- [x] 原生边界仅传可拥有的数据和数值请求标识，明确输入、对象、block、返回数据及 callback 登记的释放责任；不跨边界持有普通 Go 指针，不因调用者停止等待提前释放仍可能被使用的句柄。（WRITE-6）
- [x] completion 可来自任意线程，立即复制 NSError 字段并交 Go 更新状态与独立回读；不在 callback 中等待界面，不根据历史探针推定固定线程或完成时限。（WRITE-5、WRITE-6）
- [x] 从正式关联行或候选详情提交具体副本，只有原生成功且回读规范路径一致才确认；另一个同 bundle ID 副本、旧默认、其他应用与真实错误均保留目标、系统结果及实际路径，绝不自动重发。（WRITE-1、WRITE-4、WRITE-5）
- [x] 用独立专用文件类型及可辨认的 A／B 应用副本，完成 A 到 B 的真实修改与回读，再明确选择可用 A 作为新请求改回；至少取得一项真实成功路径，保留完整日志和正式窗口证据。不能用历史探针结果代替本项验收。（WRITE-1、WRITE-4）
- [x] 尝试同 bundle ID 多副本及手动未声明应用，按实际系统结果呈现，不能要求平台必须接受任意目标。系统错误出现时保留原始字段；未出现的错误或副本差异用受控适配器继续验证规则，证据区分原生与替身。（CAT-4、WRITE-4、WRITE-5）
- [x] 验证原生请求等待期间可浏览、查询和重载，晚到结果仍安全归属；无法自然触发的长等待用边界验证补充并注明限制，不使用固定超时宣称取消或失败。（WRITE-6）
- [x] 每次实验记录关联身份、目标完整路径、提交前默认、用户动作、系统提示与人工按钮选择、completion 和各次回读。日常 PDF、浏览器及邮件默认保持只读；保存前后基线并只清理此次专用夹具，记录并处理残留，不重置 Launch Services 全库。

依据：[实施入口](../spec.md)、[架构方案](../../default-apps-v1/assets/architecture-proposal.md)、[验收清单与原生记录要求](../../default-apps-v1/assets/acceptance-criteria.md)、[历史探针的证据边界](../../default-apps-v1/issues/08-native-behavior-probe.md)。

## Comments

- 2026-11-06：由 implement_09 在 `implement/default-apps-09` 认领；基线 `704aac2`，07/08 已通过并合并。复用已确认的公开 Go/native、持久化和正式 React/Wails 验证缝隙；真实专用 fixture 另建新身份，系统确认仅由真人操作。

- TDD：`environment-red.log` 记录正式快照无可写种类的失败，接入后通过；`native-boundary-red.log` 和 `ownership-red.log` 分别记录 deferred queue/native 错误与并发 completion 的失败，真实 C→Go 错误复制、重复回调和两个数值所有者的受控边界测试现通过 race。全仓 Go race 与 43 个 React 测试通过，普通/观察用 `.app` 均 ad-hoc 签名验证通过。
- 正式原生：全新专用身份 `419b7422bf684b7aaa7af96e558de0c1`。首次真实系统请求待决时，浏览/查询/重载、原生三种退出入口合并提示、留在/仍退出及同配置重开零重发均已观察。旧确认框在原进程退出后仍存在；真人随后允许 A，新进程只显示实际 A 与旧请求未知。新一次明确并确认旧目标风险的 A→B 已得到 nil completion、独立 B 精确路径及正式 UI confirmed；B→A 新请求当前等待其自己的人工系统确认。证据见 assets/09。

## Answer

2026-11-06 完成。真实文件类型 setter 已在唯一 Go 协调器中启用，scheme 尚未启用。公开 Wails `InvokeAsync` 只调度短小主线程发起；Go 数值 ID 登记在排队前创建，C 输入于调度闭包内分配并及时释放，ARC 原生 block 不保留 Go 指针。任意线程 NSError 字段先复制，callback 仅将 Go 后续工作排入 goroutine；原生缓冲在同步导出返回后释放。无超时、自动重发或前端生命周期持有。

正式生产 React/Wails + 真实 NSWorkspace 的新专用类型完成 A→B→A，各有独立新请求、真人系统允许、nil completion、独立规范路径回读及确认 UI。真人选择继续使用A的独立请求返回实际 `NSCocoaErrorDomain / 256 / The file couldn’t be opened.`，保留错误与实际A且不确认；未把该错误泛化为固定取消码。同 bundle ID 原A选择返回nil但实际为A Copy，正确不确认。真人原生选择器补充未声明应用后，明确候选按钮请求被系统接受并回读到精确路径。

首次真实待决系统确认期间，正式窗口浏览/查询/重载仍可用；原生菜单退出、⌘Q、最后窗口关闭合并单一产品提示，留在后再明确退出。外部观察PID退出、持久记录保留，同配置重开零自动setter、旧请求未知与独立实际B；旧系统提示在重开后仍存在，真人随后允许A时仅更新当前观察，未推断旧请求成功。这些是实际原生观察，区别于06–08替身证据。

验证：全仓Go race、2项实际C→Go受控native边界测试及43项React测试通过；普通生产和真实适配器观察构建均签名验证通过，生产输入排除测试tag/控制。原生内容1000×700截图已检查。所有实验完成后正常退出，仅注销本次4份专用包；独立查询无残留默认/候选。日常默认及候选前/后/清理后三份快照完全一致。全部细节、请求时间和人工动作见[09结果](../assets/09/results.json)、[README](../assets/09/README.md)、[HANDOFF](../assets/09/HANDOFF.md)。只验证所选本机环境，不推广为所有macOS/应用支持保证。
