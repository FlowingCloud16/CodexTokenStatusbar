# 第三方许可

项目自身代码使用根目录中的 [MIT 许可证](LICENSE)。第三方组件保留各自的许可。

| 组件 | 用途 | 许可 |
| --- | --- | --- |
| [Lucide](https://lucide.dev/) | 内嵌状态栏、主窗口与程序图标 | [ISC](desktop/licenses/lucide-0.468.0-LICENSE)，包含 Feather 的 MIT 署名 |
| [codex-statusbar](https://github.com/dongyue-19/codex-statusbar) | 生成速度算法：模型输出窗口合并、官方计数、0.35 指数平滑与保留上次采样 | [MIT](desktop/licenses/codex-statusbar-MIT) |
| [esbuild](https://github.com/evanw/esbuild) | 开发时构建页面组件，不随默认 EXE 分发 | MIT，依赖安装时随包提供 |

默认 0.6.1 EXE 不携带 Node.js。仓库保留的旧 Node 构建选项如需捆绑 Node，须同时保留 [Node.js 许可及其第三方声明](desktop/licenses/node-v24.21.0-LICENSE)。

Windows .NET Framework、SQLite 和 UCRT 使用系统安装的组件，不由本项目重新分发。

生成速度实现参照 codex-statusbar 提交 `17f0ddd25512b9a823b56a37da325d36ca53971f` 的 `src/CodexStatusbar/TpsTracker.cs`，适配为本项目的 JavaScript 与 .NET Framework 实现。对话归属、响应去重、修订和计费继续使用本项目的处理逻辑。
