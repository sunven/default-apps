# Default Apps 实施地图

更新：2026-11-06。当前集成分支为 `integration/default-apps-v1`，固定审查基线为 `c3ec320`。产品决策仍以[规格](../../spec.md)和[历史决策地图](../default-apps-v1/map.md)为准；本文件记录实施进度和当前上下文。

| 工单 | 状态 | 实施与证据 |
| --- | --- | --- |
| [01：正式窗口与 PDF 默认查询](issues/01-product-window-pdf-query.md) | resolved，已合并 | 实现 `fe75e19`，合并 `007ad10`；[验收记录](assets/01/README.md) |
| [02：常用文件类型与协议目录](issues/02-common-association-catalog.md) | resolved，已合并 | 实现 `86bf7f6`，合并 `30f54ed`；[验收记录](assets/02/README.md) |
| [03：从已安装应用浏览关联](issues/03-app-first-discovery.md) | resolved，已合并 | 实现 `234233e`，合并 `116d339`；[验收记录](assets/03/README.md) |
| [04：完整桌面搜索与键盘浏览](issues/04-desktop-search-keyboard.md) | 当前可开始 | 03 前置已满足；可与 05 分别推进 |
| [05：手动补充并跨启动保存](issues/05-manual-items-persistence.md) | 当前可开始 | 03 前置已满足；其余依赖见[实施入口](spec.md) |

01 建立的服务边界在 `internal/association/service.go`，可替换 `SystemAdapter` 分别返回默认和候选；规范应用包路径是副本身份。02 的 `internal/catalog/service.go` 通过可替换 `TypeResolver` 解析全部常用种子，合并同一身份的标签与来源，保留歧义及未解析项。03 的 `internal/discovery` 后台扫描三个常规目录，读取声明并发布独立版本快照；`internal/native` 负责公共 macOS 解析、两类关联查询与主线程／内存边界。`frontend/src/App.tsx` 通过生成绑定和目录事件提供应用优先入口、声明逐项默认、文件类型／协议浏览以及目录外副本详情。当前产品只有只读能力。

01 合并核对已检查工单全部完成项、原生查询与独立 Swift 查询的路径一致性、两份 app 的产品身份／ad-hoc 签名／13.0 构建下限、实际内容尺寸以及测试日志。02 再核对全部种子别名、类型／协议身份、来源合并、未解析与查询状态，以及 10 个 Go 服务测试的 race 日志和 10 个 React 交互测试。正式 Wails UI 与独立原生查询的全部 21 项对应，前后默认与候选未变；内容 1001×700、横向溢出 0 和双区滚动证据已核对。普通 app 的签名、产品身份和构建下限继续通过。两次均无冲突合并，合并阶段未重复已经通过的全套验收。

03 合并核对源码、15 个 Go/race 测试（含真实 plist 夹具）、13 个 React 测试及普通签名 app 构建证据。直接复核原始 JSON 得到 92 份规范路径唯一的应用、615 个关联、39 个未解析项、2 条局部问题；21 项独立原生查询一致，前后默认和候选未变。扫描进度快照复用可变切片的问题已有 red／green 测试及正式窗口刷新复跑证据。实现分支先无冲突合入 `a956fbe`，再以非快进合并进入集成分支；合并阶段未扩大范围或重复全套验收。

`git diff --check c3ec320 007ad10` 仅报告原始采集文件 `assets/01/frontend-test.log` 的末尾空行及 `assets/01/rendered-window.html` 的空白行；`git diff --check b7c310d 30f54ed` 同样仅报告 `assets/02/frontend-test.log` 的末尾空行和三个 `*-window.html` 原始 DOM 文件的空白行。采集记录原样保留。03 排除原始采集资产后也通过源码与工单差异检查，新增验收 README 单独通过。构建日志、截图、静态视觉检查和原生操作证据的边界见各工单验收记录。

下一步由 04 完成桌面搜索／键盘浏览，05 接入手动项、原生选择器和持久化，两者前置均已满足。当前完成范围不代表其余 8 个工单或完整首版已验收。
