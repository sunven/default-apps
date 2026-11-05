# Default Apps

macOS 默认应用工具。当前实现支持只读查看 PDF 的系统默认应用与候选应用，按实际应用包路径区分副本，显示名称、版本、完整路径及 bundle ID。重新查询失败时保留最后有效观察。正式产品尚未接通原生修改接口。

产品依据见 [spec.md](spec.md)，实施进度见 [实施工单](.scratch/default-apps-v1-implementation/spec.md)。

## 本机构建

固定 Go **1.27.3**、Wails CLI／Go 模块／前端 runtime **3.1.0**，保留 React 18。安装 Go 和 Wails 后，在项目根目录运行：

```sh
wails3 task darwin:package
open bin/default-apps.app
```

构建先检查版本，前端使用 `npm ci` 和已提交的锁文件；两种 app 均使用本机 ad-hoc 签名，bundle ID 为 `io.github.sunven.default-apps`。普通应用位于 `bin/default-apps.app`。

开发应用：

```sh
wails3 build DEV=true
wails3 task run
```

这会创建并启动 `bin/default-apps.dev.app`。需要热重载时运行 `wails3 dev`。开发和普通入口均为正式功能，原型资产留在源码中供查阅，未进入应用入口或打包资源。

C 编译、链接、部署目标和两份 plist 的下限均为 macOS 13；这是构建下限。实机验收范围为 **macOS 27.2／Apple Silicon**，未据此承诺全部 13+ 系统或其他架构兼容。

## 验证

```sh
go test -race ./...
npm --prefix frontend ci
npm --prefix frontend run test
npm --prefix frontend run build
```

`internal/association.Service` 管理独立默认／候选观察和错误，通过可替换的 `SystemAdapter` 访问系统；测试在这条边界覆盖空值、错误、路径身份和最后有效观察。React 测试通过生成绑定的边界驱动真实控件。原生 adapter 只在应用壳启动后的绑定调用中进入 Wails 公共主线程调度；Objective-C 在 autorelease pool 内产生 JSON，Go 复制后释放 C 缓冲区。

窗口用实际 NSWindow 样式从内容尺寸计算外框下限，内容区域至少 1000×700，原生标题栏另计。首条正式查询和普通／开发 app 的证据在 [01 验收记录](.scratch/default-apps-v1-implementation/assets/01/README.md)。
