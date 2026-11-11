# 拖入文件设置默认应用验收记录

2026-11-11；需求依据见[已确认规格](file-drop-associations.md)。本轮新增的是文件拖入、识别清单和现有批量设置的衔接。

## 自动验证

- `CGO_CFLAGS=-mmacosx-version-min=13.0 CGO_LDFLAGS=-mmacosx-version-min=13.0 go test -race ./...`：全部通过。新增后端测试验证普通文件校验、混合输入逐项反馈、重复路径、同扩展名不同实际类型、取消及识别不产生配置写入。
- `npm --prefix frontend run test`：12 个文件、124 项测试通过；其中新增 8 项拖入流程集成测试。
- 完善歧义类型的重选和可写类型限制后，针对拖入与批量设置再次运行测试：2 个文件、14 项通过。
- `npm --prefix frontend run build`：TypeScript 检查及生产构建通过。
- `wails3 task darwin:package`：版本检查、锁文件依赖安装、绑定生成、生产前端构建、Go 编译、普通应用打包及 ad-hoc 签名验证通过。普通产物位于 `bin/Default Apps.app`。

界面集成测试覆盖：实际类型去重、提交前预览、拖入批次保留原有勾选、追加与排除项保留、从预览返回清单、混合输入与歧义明确选型及重选、识别中拒收、取消后丢弃迟到响应、其他弹窗或当前请求忙时拒收且不排队、可选保存失败后继续、不可访问文件重试、接收区域卸载清理，以及丢失提交应答时核对原批次且不重复开始。

## 真实桌面观察

在本机 macOS／Apple Silicon 上，用生产界面、真实原生类型识别及独立配置的验收应用验证；该验收副本启用了现有 MCP／原生截图辅助，普通应用打包未启用这些辅助。文件从 Finder 列表中通过真实鼠标拖拽进入原生窗口，接收路径经过 Wails 原生拖放及正式事件处理，未用浏览器模拟文件对象代替。

| 场景 | 结果 |
| --- | --- |
| Finder 拖入单个 PDF | 原生接收完整路径，识别 `com.adobe.pdf`，展示对应文件与当前默认 |
| 追加另一个 PDF、文本、文件夹及未知扩展名文件 | 共 5 个文件／项目；两个 PDF 合并，文本单列，共 2 个类型；文件夹及动态未声明类型各自说明不参与设置原因 |
| 选择 Preview 并进入现有批量预览 | 展示两项实际当前默认、具体目标副本及拟操作；明确影响所有同类文件，开始前未发起写入 |
| 预览期间从 Finder 再拖入文件 | 明确提示返回清单或关闭当前面板；预览保持原清单 |
| 返回识别清单 | 原 2 个类型、5 个输入保留 |
| 取消临时清单 | 面板关闭，独立配置目录未生成配置文件，未自动保存文件路径或手动关联 |
| 最小内容区域附近查看清单及预览 | 1001×709 内容区域无水平溢出；长清单及问题项可滚动查看，底部选择应用按钮可达 |
| 普通打包产物启动及 Finder 拖入 PDF | 使用正常配置启动 `bin/Default Apps.app`，观察到识别清单、PDF 类型及文件路径；随后取消，未提出修改请求 |

本地证据位于 `.scratch/file-drop/evidence/`：`finder-single-drop.json`、`finder-single-drop-actual.png`、`finder-multiple-drop.json`、`finder-multiple-drop.png`、`finder-multiple-drop-bottom.png`、`native-preview.json`、`native-preview.png`、`preview-refuses-real-drop.json`、`formal-window.png` 及 `package.log`。`formal-window.png` 记录取消清单后的普通应用窗口；验收辅助进程与本轮启动的普通应用进程均已关闭，测试 Finder 窗口已清理，临时收起的原窗口已恢复。

普通产物版本为 `0.1.5`，Go 构建信息确认仅 `-tags=production`、`darwin/arm64`，不含验收辅助标签；签名验证通过。二进制 SHA-256：`db91d71321d57bafe636a57b34230a9325e1dca8a294046f7b8db206316457a0`。

## 验证边界

本轮真实桌面验证到预览和取消，没有修改日常 PDF 或文本的系统默认。点击开始后的提交、应答核对及勾选隔离通过界面集成测试验证；执行服务及真实系统修改沿用[批量设置验收](batch-file-associations-validation.md)已经记录的证据和限制，不能把本轮原生拖放观察表述为新增的真实写入成功证明。

真实文件识别本轮没有出现多个可用类型的歧义；这条分支由确定性界面测试覆盖。Dock 图标接收、未启动时接收、文件夹递归和其他平台均不属于本次范围。
