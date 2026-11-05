# macOS 默认应用工具：首版规格地图

Labels: wayfinder:map
Status: resolved

## Destination

明确这个 macOS 默认应用工具的首版产品范围、交互方式和技术路线，形成可以直接进入开发的规格。
地图完成时，核心能力有事实依据、用户操作与验收标准已确定，没有阻挡首版开发的未决问题。

已于 2026-11-05 完成全部决策。交付入口：[首版规格](../../spec.md)；完成标准：[已确认验收清单](assets/acceptance-criteria.md)。本地图完成不表示产品实现或成品验收已经完成。

## Notes

- 用户于 2026-11-05 确认：本轮先明确首版规格；Wails V3 是确定的技术栈。
- 首版核心：文件类型、URL 协议的默认应用；支持从已安装应用查看和修改其关联项。
- [用户参考图](assets/reference-default-apps.png)来自经典 Default Apps 设置面板，借鉴功能与工作方式，视觉方向是现代 macOS 工具；主布局已由用户选择 A「应用优先」，详见主界面决策。
- 首版先自用，产品分发以后另行考虑。
- 用户明确：这是桌面应用，不考虑移动端；布局与验收只针对 macOS 桌面窗口，检查窗口缩放和内容滚动。
- 当前项目：Wails Go 依赖、CLI、前端 runtime 均为 3.1.0；React 18 / TypeScript / Vite 脚手架。当前开发机器为 macOS 27.2 / arm64；脚手架的部署目标为 macOS 12.0，这不等于已承诺的产品兼容范围。
- 每轮查阅 `/Users/sunven/.agents/skills/wayfinder/SKILL.md`；对话决策使用 grilling 与 domain-modeling；研究使用 research；原型使用 prototype。领域术语见 [GLOSSARY.md](../../GLOSSARY.md)。
- 使用本地 Markdown tracker，约定来源为 `/Users/sunven/.agents/skills/setup-matt-pocock-skills/issue-tracker-local.md`。地图是本文件，子工单位于 `issues/`。`Labels` 只使用 `wayfinder:` 标签；`Type` 记录类型；`Status: open` 表示未领取，`claimed` 表示已领取，`resolved` 表示已关闭；`Assignee` 记录领取者；`Blocked by` 记录阻塞工单编号。无阻塞、未领取的开放工单构成 frontier，按编号顺序选取。
- 当前目录没有 Git 仓库或 remote。研究暂存到 `research/` 并从工单链接，不初始化 Git、不假定推送成功；接入远端后可补存为 `research/<name>` 临时分支，不合并到产品分支。
- 用户在地图建立后要求继续，现按 frontier 逐项推进；每轮最多解决一张非研究工单。研究不得修改用户真实的默认应用设置。

## Decisions so far

<!-- 每个已解决工单只在此保留一句结论与命名链接，详细答案仅存在于该工单。 -->

- [macOS 默认关联有哪些可用接口与系统限制？](issues/01-macos-association-api.md)：公开 NSWorkspace 接口可查询和异步修改默认关联；目录需组合来源，类型身份、声明支持与当前默认必须区分。
- [Wails V3 如何承载 macOS 默认关联能力？](issues/02-wails-v3-native-bridge.md)：优先候选是 Go 服务配合薄 cgo/Objective-C 适配器；现用 Go 1.27 要求 macOS 13+，选型和产品兼容范围仍待决定。
- [首版的关联目录与候选应用应如何定义？](issues/03-association-catalog.md)：采用三种目录来源、系统候选与手动选择；保留应用副本差异，未解析输入可用实际文件识别。
- [应用视角与关联项视角如何组成首版主界面？](issues/04-main-workflow-prototype.md)：用户选择 A「应用优先」作为首版主入口，保留文件类型与 URL 协议浏览；写入语义另行决定。
- [Wails 中的原生确认、晚到回调与回读如何实际表现？](issues/08-native-behavior-probe.md)：专用关联实机验证了后台回调、取消等待后仍可成功和副本路径差异；测试已清理，系统拒绝及真实待决退出保留验收边界。
- [修改默认关联时，用户如何确认结果与处理失败？](issues/05-change-semantics-prototype.md)：用户选择逐项立即修改、手动改回和持续等待；待决时暂停新写入，以实际回读确认结果，退出前提示结果未知。
- [首版采用哪条原生桥接路线与服务边界？](issues/06-architecture-boundary.md)：用户接受单进程 cgo 与 Go 请求协调器，保存手动项和单条未定记录；首版验收限定当前 macOS／Apple Silicon 自用环境。

- [应用优先界面如何处理长列表、搜索、空态与键盘操作？](issues/09-desktop-workflow-details.md)：用户选择双列表独立滚动、1000×700 最小内容区域和完整键盘规则；搜索、空态、刷新与旧请求说明均有可操作原型。

- [哪些验收情景足以让首版规格进入开发？](issues/07-spec-acceptance.md)：用户确认常用项集合和分层验收门槛，真实专用写入与核心规则必测，无法触发的特殊系统观察明确列出限制；首版规格已定稿。

## Not yet specified

- 无。范围内的决策工单均已解决；未观察的系统行为已在验收门槛中明确处理，不作为新的未决产品问题。

## Out of scope

- 本轮直接实现、打包完整产品：本地图的终点是可开发的首版规格。
- Windows、Linux、移动端支持：产品目标限定为 macOS。
- 商业分发、Developer ID 签名与公证、Mac App Store 上架和自动更新：用户明确首版先自用；仅保留本机运行所必需的构建条件。
- 修改单个文件自己的默认应用：用户确认首版仅修改整类文件与 URL 协议；实际文件只作为识别类型的输入。
