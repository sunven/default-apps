# Default Apps 实施地图

更新：2026-11-05。当前集成分支为 `integration/default-apps-v1`，固定审查基线为 `c3ec320`。产品决策仍以[规格](../../spec.md)和[历史决策地图](../default-apps-v1/map.md)为准；本文件记录实施进度和当前上下文。

| 工单 | 状态 | 实施与证据 |
| --- | --- | --- |
| [01：正式窗口与 PDF 默认查询](issues/01-product-window-pdf-query.md) | resolved，已合并 | 实现 `fe75e19`，合并 `007ad10`；[验收记录](assets/01/README.md) |
| [02：常用文件类型与协议目录](issues/02-common-association-catalog.md) | 当前可开始 | 01 前置已满足；其余依赖见[实施入口](spec.md) |

01 建立的服务边界在 `internal/association/service.go`，可替换 `SystemAdapter` 分别返回默认和候选；规范应用包路径是副本身份。`internal/native` 负责公共 macOS 查询与主线程／内存边界，`frontend/src/App.tsx` 通过生成绑定呈现真实结果。普通和开发 app 已验证；目前只有 PDF 查询，尚未接通 setter。

合并核对已检查工单全部完成项、原生查询与独立 Swift 查询的路径一致性、两份 app 的产品身份／ad-hoc 签名／13.0 构建下限、实际内容尺寸以及测试日志。已有 5 个 Go 服务测试与 race 检查、6 个 React 交互测试通过；没有因无冲突合并而重复全套原生验收。

`git diff --check c3ec320 007ad10` 仅报告原始采集文件 `assets/01/frontend-test.log` 的末尾空行及 `assets/01/rendered-window.html` 的空白行；保留原始记录。排除这组采集资产后，全部产品源码与工单差异检查通过。普通／开发构建日志、截图、静态视觉检查和原生操作证据的边界见 01 验收记录。

下一步由 02 接入已确认的常用种子、正式类型解析与协议查询；03 再接入应用优先目录。当前完成范围不代表其余 10 个工单或完整首版已验收。
