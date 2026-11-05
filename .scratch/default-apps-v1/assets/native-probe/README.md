# Default Apps 原生行为探针

抛弃式 Wails 3.1.0 + Go/cgo/Objective-C 程序，用于[原生行为探针工单](../../issues/08-native-behavior-probe.md)。独立源码和 `.app` 位于本目录；产品入口、前端、依赖及构建配置没有接入探针。

## 已完成的观察

2026-11-05，当前 macOS 27.2 / arm64、Go 1.27.3。独立 `.app` 已编译、ad-hoc 签名并实际启动。真实 Wails/WebKit 前端通过绑定读取 NSWorkspace 查询结果，并执行只读自检。

- 18 项只读检查通过：主线程查询、拒绝未授权的专用关联和 PDF 写入、三次取消 Wails promise 后的晚到原生回调、主线程继续响应、一次正常延迟回调和 WebKit 动画继续运行。
- 回调由探针的 `dispatch_after` 人为安排在后台队列，用于验证跨 cgo 边界的生命周期；**不是 NSWorkspace setter 回调线程的观察**。三次取消后回调仍安全到达，日志标记 `lateAfterCancellation: true`。未发生崩溃。
- 第一次运行记录 237 个动画帧，所测主线程 Ping 最大往返约 4 ms，最大帧间隔 180 ms；这不是系统确认期间的性能保证。
- 此阶段真实 setter 提交数为 **0**。PDF 当前默认为 `/Applications/Google Chrome.app`；mailto 为 Mail，http/https 为 Chrome。查询没有打开任何文件或链接。

证据：[首次只读日志](runs/20261105-143147.325.jsonl)、[Wails 窗口截图](native-window.png)、[只读基线](baseline.json)。新运行产生独立 JSONL，具体状态以日志为准。

随后完成了 10 次专用关联真实 setter 实验，观察到后台 completion、同 bundle ID 副本路径差异，以及取消 Go 等待后经用户系统同意仍成功的真实回调。最终已关闭探针并注销测试应用；PDF、邮件、浏览器默认值与只读基线一致。[工单答案](../../issues/08-native-behavior-probe.md)为完整实机结论、日志来源和未覆盖情景的唯一记录。

## 运行

在仓库根目录执行：

```sh
python3 .scratch/default-apps-v1/assets/native-probe/build.py
python3 .scratch/default-apps-v1/assets/native-probe/run.py self-test
```

构建只创建测试 `.app`、独立探针、签名和只读快照；不注册测试应用、不调用 setter。`self-test` 在真实 Wails/WebKit 运行只读检查，记录结果后自动退出。`inspect` 仅输出查询；`exit-test` 提交一个 15 秒的人为延迟回调，在 5 秒时退出，用于记录未完成请求的进程退出边界，仍不调用 setter。

可以直接打开 `out/Native Behavior Probe.app` 的可执行程序，但必须传入 `--workspace` 本目录绝对路径；推荐使用启动器，避免缺少参数。

## 实机实验范围与复现

专用关联使用本次生成的唯一标识，不使用 PDF、mailto、http 或 https：

| 范围 | 身份与目标 | 恢复与清理 |
| --- | --- | --- |
| 专用文件类型 | `org.defaultapps.probe.7a9a0204.document` | 测试前无类型与默认；结束注销测试应用，重新查询并记录残留，不执行全库重置。 |
| 专用 URL 协议 | `defaultapps-probe-7a9a0204` | 测试前无候选与默认；同上。 |
| 专用目标应用 | 候选 A、候选 B、A 的同 bundle ID 副本、未声明应用，全部在 `out/fixtures/` | 日志保留精确路径；只注销这些测试 `.app`。 |
| 可选 PDF 实验 | `com.adobe.pdf` → `/System/Applications/Preview.app` | 每次实验前独立保存 PDF 当前路径，随后恢复该路径并回读确认；当前路径为 Google Chrome。 |

本轮用户要求继续后，执行了 `run.py fixtures`：先保存查询，逐个注册专用 `.app`，记录候选，再在 Wails 窗口顺序测试两类关联各四个目标。每次记录提交线程、真实 completion 的线程与错误、完成后约 0/100/500/2000 ms 的默认应用回读。结束后关闭窗口，启动器只注销测试应用并记录清理查询。再次运行此模式会重新注册并修改这些专用关联，应明确本次复现实验范围。如果系统仍返回测试应用，明确标记清理未被验证；不声称“恢复为未设置”。

已运行的额外场景 `run.py fixtures --scenario fixture:type:b --cancel-after-ms 50` 在专用类型 setter 提交后取消 Go 等待。真实回调仍依赖系统确认，用户操作后才到达。停止 Go 等待不能消除原生提示；回调后读回并关闭探针，启动器再注销测试应用。

系统可能请求用户确认。是否出现、错误码及回读是否保留副本都是实验问题；看到原生提示后，由用户自行选择。探针不替用户同意。测试应用不打开用户内容，仅用于声明与选择。

可选 PDF 实验：`run.py pdf --cancel-after-ms 1500` 会在提交后 1.5 秒取消 Go 等待。若系统确认出现，用户可保持提示到等待取消后，再选择允许或取消。取消等待不撤回原生请求。待真实 completion 和回读完成后，关闭窗口；`run.py restore-pdf` 恢复本次实验前保存的应用，并记录回读是否一致。不能在待决原生提示仍存在时开始恢复；也不能把回调错误等同于系统未发生变化。

如果 PDF 修改没有出现系统确认，本实验只能证明该路径的行为；不改动默认浏览器或邮件应用来强求弹窗。需要额外实验时另定具体范围。

人工步骤由[交互式向导](manual-wizard.sh)引导。在 Terminal 中运行它；默认只包含专用关联，可通过 `--pdf` 加入 PDF 切换与恢复。向导只是记录人工观察和运行探针，系统原生同意仍由用户操作。

## 日志与边界

`runs/*.jsonl` 每行分别记录 `native-submitted`、`go-wait-cancelled`、`native-completion`、`readback` 和退出请求；请求 ID 独立于 Wails promise 生命周期。真实请求在回读观察完成前保留占用，避免同一关联被并发重复写入。当前 macOS Wails Quit 直接终止进程，`app.Run()` 后的 `process-exit` 记录不一定执行；退出码由外层启动器返回，不依赖该行日志。

`manifest.json` 保存测试类型和精确应用路径；`pdf-experiment-baseline.json` 保存具体 PDF 实验的恢复路径。恢复只承诺尝试原值并报告实际回读，若原应用已卸载或平台选中其他副本，结果不能伪装成恢复成功。当前自用机器的证据不能外推到 Intel 或旧系统。

本次探针调查已结束，工单已关闭。系统确认取消/拒绝的具体错误及真实系统请求待决时退出后的效果仍未验证；后续在修改语义与验收决策中保留这些边界。可选 PDF 实验未执行，不需为当前专用测试恢复 PDF。
