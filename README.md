# Default Apps

macOS 自用默认应用工具。从已安装应用出发浏览文件类型和 URL 协议，也可直接按关联查找。扫描、声明、系统候选和当前默认分别呈现；同名或同 bundle ID 的副本按实际应用包路径区分。

每次明确选择只修改一个关联。应用先保存未定请求，再调用系统；只有原生 completion 成功且回读匹配目标规范路径，才确认本次修改。等待期间仍可浏览和查询。退出不会撤回系统请求；重开只查询当前状态，旧请求保持结果未知，需要再次明确操作才能提出新修改。

支持应用／关联搜索、双列表独立滚动、键盘浏览、原生文件识别／应用选择器、手动项跨启动保存，以及查询失败重查。配置位于 `~/Library/Application Support/Default Apps/config.json`。日常使用从普通应用启动：

```sh
open bin/default-apps.app
```

本机构建固定 Go **1.27.3**、Wails CLI／模块／前端 runtime **3.1.0**，保留现有 npm 锁文件和 React **18.3.1**：

```sh
wails3 task darwin:package
open bin/default-apps.app
```

任务执行版本检查、`npm ci`、生成绑定和前端构建，并以本机 ad-hoc 签名打包 `bin/default-apps.app`。产品名称为 Default Apps，bundle ID 为 `io.github.sunven.default-apps`，版本 0.1.0。开发产品使用同一身份与正式入口：

```sh
wails3 build DEV=true
wails3 task run
```

这会创建并启动 `bin/default-apps.dev.app`。热重载使用 `wails3 task dev`。开发和普通产物均不包含原型、压力数据、MCP 或原生验收控制器。

C 编译、链接、部署目标和两份 plist 的下限均为 **macOS 13**；这是构建下限。实际签收环境为 **macOS 27.2／Apple Silicon**，未验证所有 13+ 系统、Intel 或 universal。商业分发、公证、商店、自动更新和其他平台不在首版范围。

2026-11-06 的[成品验收报告与全部 25 项矩阵](.scratch/default-apps-v1-implementation/assets/11/README.md)包含普通／开发启动、签名、哈希、实际工具版本及本机限制。专用文件类型和协议均通过真实 A→B→A；文件请求的真实拒绝、同 ID 副本差异、未声明应用、待决退出重开另有记录。协议实验在 11–14ms 返回，未观察到它的系统提示或持续等待；不保证所有协议接受任意应用。日常 PDF、浏览器、邮件仅做只读核对。

开发验证：

```sh
CGO_CFLAGS=-mmacosx-version-min=13.0 CGO_LDFLAGS=-mmacosx-version-min=13.0 go test -race ./...
npm --prefix frontend ci
npm --prefix frontend run test
npm --prefix frontend run build
```

需求依据见 [spec.md](spec.md)、[GLOSSARY.md](GLOSSARY.md) 和[实施工单](.scratch/default-apps-v1-implementation/spec.md)。历史浏览器原型与独立探针保留供查阅；产品验收以成品报告的层级、构建与限制为准。
