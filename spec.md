# Default Apps 首版规格

状态：**首版规格已确认**。要求确认于 2026-11-05；实现与验收记录更新于 2026-11-06。

2026-11-10 增补：[本工具更新规格](docs/automatic-updates.md)扩展了首版之外的自动检查、手动下载安装及发布链路。下文“更新不在首版范围”保留为首版历史边界；本工具更新以增补规格为准。

本文件是开发入口；具体规则以链接的已确认决议为准。用户已确认常用项集合、分层验收与实机限制，规格没有剩余产品决策。2026-11-05 定案时产品还是 Wails 脚手架；现已实现，成品证据与限制见[最终验收报告](.scratch/default-apps-v1-implementation/assets/11/README.md)。下文的规范性要求保持不变。

## 用户目标与范围

用户在自己的 Mac 上从已安装应用出发，查看它声明支持的文件类型／URL 协议及系统当前默认，逐项选择具体应用副本并验证实际结果；也能直接按文件类型或协议查找。

首版仅 macOS 桌面、自用，兼容验收限定已选择的 macOS 27.2／Apple Silicon 环境。产品采用现代 macOS 工具布局。文件选择用于识别整类类型，不修改单个文件自己的默认；商业分发、公证、商店、更新、Intel／universal、其他平台和移动布局均不在范围。

首版不提供暂存、批量设置、恢复按钮、停止等待或撤回系统请求，也不承诺全系统目录枚举、所有协议强制改写、原子回滚或固定系统完成时限。

## 决议入口

| 主题 | 已确认结果的摘要 | 规范性细节 |
| --- | --- | --- |
| 能力依据 | 公共查询、异步修改和 UTType 识别；实际平台结果需独立观察 | [macOS 默认关联接口](.scratch/default-apps-v1/issues/01-macos-association-api.md)、[Wails 桥接事实](.scratch/default-apps-v1/issues/02-wails-v3-native-bridge.md) |
| 关联与应用目录 | 常用项＋应用声明＋手动项；扫描三个目录及子目录，按路径保留副本，系统候选独立查询 | [目录与候选决议](.scratch/default-apps-v1/issues/03-association-catalog.md) |
| 主入口 | A 应用优先，保留文件类型、URL 协议入口 | [主流程决议](.scratch/default-apps-v1/issues/04-main-workflow-prototype.md) |
| 修改方式 | 逐项立即提交；持续等待；系统结果与回读分开，成功且精确路径一致才确认 | [修改语义决议](.scratch/default-apps-v1/issues/05-change-semantics-prototype.md) |
| 架构与存储 | Go 服务＋薄 cgo／Objective-C 适配器；Go 持有请求；保存手动项和单条未定记录 | [架构决议](.scratch/default-apps-v1/issues/06-architecture-boundary.md)、[已确认架构方案](.scratch/default-apps-v1/assets/architecture-proposal.md) |
| 桌面交互 | 双列表独立滚动，最小内容区域 1000×700，已确认搜索、空态与完整键盘规则 | [桌面交互决议](.scratch/default-apps-v1/issues/09-desktop-workflow-details.md) |
| 平台实证 | 规划阶段的独立探针记录；正式产品后续实证与限制见最终验收报告 | [原生探针结论](.scratch/default-apps-v1/issues/08-native-behavior-probe.md) |
| 完成标准 | 未来产品的场景、测试分层、成品实机范围与证据记录 | [验收工单](.scratch/default-apps-v1/issues/07-spec-acceptance.md)、[已确认验收清单](.scratch/default-apps-v1/assets/acceptance-criteria.md) |

术语统一使用[领域词汇表](GLOSSARY.md)。相同扩展名不是相同文件类型；声明支持不是系统候选或当前默认；同 bundle ID 不等于同一应用副本。

## 必须实现的核心路径

1. 启动后异步发现应用与关联目录，显示可用结果及局部扫描问题。默认进入应用视角；选中应用显示版本、路径和声明关联，每项独立显示实际默认。
2. 搜索应用信息或声明，或转到文件类型／协议。处理歧义、无声明、无结果、未解析、无默认与查询失败。手动项及目录外应用通过原生选择器补充，取消不提交。
3. 用户在行内或候选中明确选择一个具体副本。Go 在受理前检查最新默认和可用性，原子保存未定记录，再调度原生 setter；受理返回不等待系统确认。已是目标、副本消失、外部变化、忙、存储失败分别反馈。
4. 任一请求结果未定或回读未确定时暂停新写入，允许浏览和查询。全局状态及关联行共享请求；收到 completion 后回读。错误、另一副本、旧值、查询失败不能成为假成功，也不能自动重发。
5. 用户需要改回时，查看实际默认并明确选择现有副本，作为新请求处理。退出前提示结果未知；菜单退出、⌘Q、关闭最后窗口走同一判断。重新打开只查询，旧请求仍未知；再次修改先说明旧请求可能完成。

这些路径的排序、状态与边界详见相应决议；验收编号见[验收矩阵](.scratch/default-apps-v1/assets/acceptance-criteria.md#验收矩阵)。首版常用项集合也在该文件，未解析种子不会被伪造成系统支持。

## 工程约束与实现边界

- 一个 Wails 进程。React 管理浏览与呈现，通过生成绑定、类型化事件及快照访问 Go。目录、身份、请求去重、版本、门控和恢复规则由 Go 负责；薄 Darwin 适配器负责公共系统接口、线程及内存所有权。
- 文件关联身份为 kind＋可解析 UTType identifier，协议为 kind＋规范 scheme；应用为规范 bundle 路径。保留元数据和展示路径，不通过 bundle ID 或对路径一律小写来合并副本。
- 提交／completion／实际观察分别建模。重复请求标识去重，事件与快照按版本协调；调用者等待、前端监听和原生生命周期独立。存储先于 setter，旧进程请求永不重放。
- 手动配置与单条未定记录使用用户 Application Support 下版本化原子 JSON；损坏文件保留并报告。无数据库、云同步或永久操作历史。
- 固定 Go 1.27.3，Wails CLI／模块／前端 runtime 3.1.0；遵守现有前端锁文件与 npm ci，保留 React 18。部署／链接／plist 下限统一为 macOS 13，仅代表构建下限。普通与开发 app 使用一致的产品身份和下限，本机 ad-hoc 签名。
- 产品实现需重写抛弃式原型中的模拟数据、选择器和状态壳；原型不是可直接提升为成品的服务实现。退出与原生访问使用公开 Wails API，不以 app.Run 返回后首次保存作为保证。

## 验收与交付

[已确认验收清单](.scratch/default-apps-v1/assets/acceptance-criteria.md)区分规格完成和成品完成，给出规则／界面／原生各层的可观察结果。正式实现需提供可运行 `.app`、相应自动验证、核心桌面操作记录及本机集成报告；每项记录通过、失败、尚未执行或尚未观察。采用已确认的分层验收：专用类型／协议真实成功、正式窗口退出／恢复和确定性边界必须通过；系统取消或真实待决退出经尝试仍无法触发时，明确记录尚未观察及自用限制。日常 PDF／邮件／浏览器在本轮成品验收中保持只读；正式专用关联写入由 09／10 工单记录。

2026-11-05 规划证据包括文档研究、92 份应用声明抽样、内存原型和独立探针的 10 次专用关联 completion；当时尚无正式产品验收。2026-11-06 正式产品已取得专用类型／协议成功，以及文件请求的真实拒绝、待决退出重开、同 ID 副本差异和未声明应用实证。协议提示／持续待决未观察，日常 PDF／邮件／浏览器改写未执行。具体范围与原始记录见最终验收报告，不据单次结果建立固定错误码或系统保证。

2026-11-05 的历史代码起点为：问候示例服务、1000×618 窗口、go.mod 的 1.26、Darwin 12.0 部署值、npm install 构建任务及脚手架产品 metadata。这些已由实施工单对齐，不改变已确认规格；此段仅记录规划时的起点。

## 参考资产

- [规格地图](.scratch/default-apps-v1/map.md)：决策索引与范围。
- [已选应用优先主界面原型](frontend/src/prototypes/default-apps/README.md)：其历史暂存语义已由修改决议替换。
- [修改交互原型](frontend/src/prototypes/default-apps/change-semantics-README.md)：含未选中的历史比较情景，不能将它们纳入产品。
- [桌面工作流原型](frontend/src/prototypes/default-apps/desktop-workflow-README.md)：已选 A 滚动、1000×700 与完整键盘规则；B/C 与演练控制栏仅供回看。
- [应用声明抽样](.scratch/default-apps-v1/assets/catalog-sample/README.md)：真实目录规模与压力样本区分。

决策冲突时以相应工单的最终 Answer 和已确认架构为准；原型示例、历史提案和独立探针仅提供证据。全部决策工单已解决；本文件是规范入口；产品实现与成品验收另由实施工单和最终验收报告记录。
