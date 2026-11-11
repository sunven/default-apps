# Default Apps

macOS 自用默认应用工具。从已安装应用出发浏览文件类型和 URL 协议，也可直接按关联查找。扫描、声明、系统候选和当前默认分别呈现；同名或同 bundle ID 的副本按实际应用包路径区分。

单项修改每次处理一个关联；文件类型页也支持勾选多个类型，统一选择一个应用，预览后逐项设置。勾选跨搜索和筛选保留，全选仅作用于当前结果。批次允许部分成功，明确失败继续、外部变化跳过、结果未定等待；可以停止后续设置，并在重开后预览、确认继续最近一批的未执行项。

应用先保存未定请求和对应批次进度，再调用系统；只有原生 completion 成功且回读匹配目标规范路径，才确认本次修改。等待期间仍可浏览和查询。退出不会撤回系统请求；重开只查询当前状态，旧请求保持结果未知，需要再次明确操作才能提出新修改。批量设置的完整规则与验证边界见[批量设置规格](docs/batch-file-associations.md)及[验收记录](docs/batch-file-associations-validation.md)。

支持应用／关联搜索、双列表独立滚动、键盘浏览、原生文件识别／应用选择器、手动项跨启动保存，以及查询失败重查。配置位于 `~/Library/Application Support/Default Apps/config.json`。

同一用户只运行一个实例，普通版、开发版和不同安装副本共用此限制，避免并发覆盖未定请求与批次记录。再次启动会唤起已有窗口；异常退出后可以重新启动并读取恢复记录。

也可以把一个或多个普通文件拖到已打开的窗口：查看按文件类型去重的识别清单，统一选择应用，预览后开始设置。设置影响该类型的所有同类文件；不支持或无法识别的输入逐项说明，识别本身不保存文件路径。清单支持追加及可选保存手动关联；执行、结果和恢复沿用批量设置。具体规则及验证边界见[拖入文件规格](docs/file-drop-associations.md)与[验收记录](docs/file-drop-associations-validation.md)。

日常使用从普通应用启动：

```sh
open "bin/Default Apps.app"
```

本机构建固定 Go **1.27.3**、Wails CLI／模块／前端 runtime **3.1.0**，保留现有 npm 锁文件和 React **18.3.1**：

```sh
wails3 task darwin:package
open "bin/Default Apps.app"
```

任务执行版本检查、`npm ci`、生成绑定和前端构建，并以本机 ad-hoc 签名打包 `bin/Default Apps.app`。产品名称为 Default Apps，bundle ID 为 `io.github.sunven.default-apps`，版本以 `internal/buildinfo/version.txt` 为准。开发产品使用同一身份与正式入口：

```sh
wails3 build DEV=true
wails3 task run
```

这会创建并启动 `bin/Default Apps.dev.app`。热重载使用 `wails3 task dev`。开发和普通产物均不包含原型、压力数据、MCP 或原生验收控制器。

C 编译、链接、部署目标和两份 plist 的下限均为 **macOS 13**；这是构建下限。实际签收环境为 **macOS 27.2／Apple Silicon**，未验证所有 13+ 系统、Intel 或 universal。商业分发、公证、商店和其他平台不在范围；首版之后新增了下述本工具更新功能。

正式版启动后自动检查一次 GitHub Releases；从顶栏“软件更新”查看自身版本、更新说明并手动下载，下载校验完成后再确认重启安装。只替换当前运行且目录可写的应用副本；有结果未定的关联修改时，先完成现有退出确认，退出不会撤回系统请求。开发版禁用真实更新。

更新仅支持 macOS Apple Silicon，使用 SHA-256 校验，不配置更新包密钥签名、Developer ID 或公证；保留本机 ad-hoc 构建处理。首次手动安装后如被系统隔离，按实际安装位置执行：

```sh
xattr -dr com.apple.quarantine "/Applications/Default Apps.app"
```

首次安装带更新能力的版本仍需手动完成。发布源必须可匿名读取；`sunven/default-apps` 已设为公开，客户端通过公开接口检查与下载更新。[发布指南](docs/releasing.md)说明统一版本、标签发布与手动打包；[更新规格](docs/automatic-updates.md)记录范围与验证边界。

2026-11-06 的[成品验收报告与全部 25 项矩阵](.scratch/default-apps-v1-implementation/assets/11/README.md)包含普通／开发启动、签名、哈希、实际工具版本及本机限制。专用文件类型和协议均通过真实 A→B→A；文件请求的真实拒绝、同 ID 副本差异、未声明应用、待决退出重开另有记录。协议实验在 11–14ms 返回，未观察到它的系统提示或持续等待；不保证所有协议接受任意应用。日常 PDF、浏览器、邮件仅做只读核对。

最终双轴审查的三项问题已修复，55 项 React 测试及正式窗口补验通过。[最终交付记录](.scratch/default-apps-v1-implementation/assets/final-review/DELIVERY.md)提供更新后的应用哈希、构建／启动验证和清理记录；其中的产物信息替代先前 11 号报告的哈希。

开发验证：

```sh
CGO_CFLAGS=-mmacosx-version-min=13.0 CGO_LDFLAGS=-mmacosx-version-min=13.0 go test -race ./...
CGO_CFLAGS=-mmacosx-version-min=13.0 CGO_LDFLAGS=-mmacosx-version-min=13.0 go test -race -tags native_adapter_test ./internal/native
npm --prefix frontend ci
npm --prefix frontend run test
npm --prefix frontend run build
```

需求依据见 [spec.md](spec.md)、[GLOSSARY.md](GLOSSARY.md) 和[实施工单](.scratch/default-apps-v1-implementation/spec.md)。历史浏览器原型与独立探针保留供查阅；产品验收以成品报告的层级、构建与限制为准。
