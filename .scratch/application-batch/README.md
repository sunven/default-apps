# 应用页批量设置交付记录

2026-11-14，macOS 27.2.1 / Apple Silicon。功能规则见 [应用页批量设置](../../docs/application-batch-settings.md)。

## 自动验证

- `npm --prefix frontend test`：16 个文件、209 项测试通过，见 [tests.log](tests.log)。覆盖应用路径隔离、文件类型页与拖入清单隔离、固定目标预览、取消及迟到响应、失败重试、受理后清理和丢应答核对。
- `wails3 task darwin:package`：TypeScript 检查、生产构建、原生构建、应用打包和签名校验通过，见 [package.log](package.log)。
- `npx --no-install astryx doctor --built dist`：20 项通过、0 失败、2 警告；警告为主题外部字体加载无法静态证明，见 [doctor.log](doctor.log)。
- `git diff --check`：通过。

本轮继续工作只删除了新流程接入后不再使用的 `can.showSelected` 字段，补齐验证与清理记录；未改变 Go 服务或配置格式。

## 浏览器检查

使用当前前端入口及 [fixtures.js](fixtures.js) 示例服务，在独立 `agent-browser` 会话中验证；示例服务不调用系统设置接口。

- 1000×700 窗口中，全选包含未滚动到的文件类型：已选清单共有 91 项，协议行没有复选框。
- 文件类型复选框使用空格切换，不打开详情；表格及页面横向溢出均为 0。
- 直接预览固定为 Google Chrome 实际路径，没有“更换应用”；预览横向溢出为 0，见 [browser-preview.json](browser-preview.json)。
- “返回调整”关闭预览并保留勾选，见 [browser-return.json](browser-return.json)。
- 截图：[已选](browser-selected.png)、[预览](browser-preview.png)。截图可能包含弹窗入场过渡；布局数值来自稳定后的 DOM。

## 原生验证及边界

前一会话使用带 `production,mcp,manual_smoke,lifecycle_smoke` 标签的原生测试包、隔离配置和随机专用文件类型完成真实应用扫描、勾选、固定目标预览、返回调整、切换应用保留及再次提交。没有使用 `change_smoke` 替换系统修改实现。

保留的原生截图：[勾选](native-application-selected.png)、[预览](native-application-preview.png)。隔离持久化记录见 [native-admission.json](native-admission.json)：原批次已受理并保存提交身份，第一项为 `waiting`、第二项为 `queued`，第一项尝试次数为 1。运行日志为空。

提交后的 MCP 状态查询超时，未取得最终 completion 或独立系统回读结果。因此本轮只确认真实预览和批次受理，不宣称两个专用类型已成功设置，也不以空日志证明没有原生问题。常用 PDF、纯文本、浏览器和邮件关联未作为写入目标。既有执行机制的验证范围仍见 [批量设置验收记录](../../docs/batch-file-associations-validation.md)。

本轮测试应用已注销并删除，详情见 [fixture-cleanup.json](fixture-cleanup.json)。随机专用类型的系统偏好记录可能仍存在；未重置系统关联数据库。浏览器会话、预览服务器及本轮遗留测试进程已结束；原会话 transcript 只读且未修改。

## 产物

应用：`bin/Default Apps.app`，版本仍为 0.1.9（未发布）。

最终可执行文件 SHA-256：`1179d3bbbebe95933115f9056ce91616a14987c607324216637bce1e34baccd4`。

本轮未发布新版本。
