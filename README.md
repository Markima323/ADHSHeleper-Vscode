# ADHD Code Focus

这是依据 [`ADHD_Code_Focus_VSCode_开发文档_v0.1.docx`](./ADHD_Code_Focus_VSCode_开发文档_v0.1.docx) 实现的本地优先 VS Code 扩展 MVP。

## 已实现

- 仅在可视区域扫描并部分加粗标识符和注释，不修改源码。
- 支持 camelCase、PascalCase、snake_case、缩写、数字边界和 Unicode grapheme。
- 状态栏、命令面板和快捷键开关。
- 从选区、当前函数/类或当前文件创建分块学习卡片。
- 每卡最多 10 个代码词元的点击式填空，支持即时反馈、撤销和重置。
- 每张卡片自动使用系统 Web Speech API 进行一次英语代码朗读，朗读期间仍可填空。
- VS Code 主题、高对比度、键盘焦点和减少动态效果适配。
- 最近 200 条学习会话摘要保存在 `globalState`，不保存源码。

## 本地开发

要求 Node.js 20 或更高版本，以及 VS Code 1.90 或更高版本。

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

在 Windows PowerShell 禁止运行 `npm.ps1` 时使用 `npm.cmd`。按 `F5` 会先构建工程并打开 Extension Development Host。

生成可安装包：

```powershell
npm.cmd run package
```

输出位于 `apps/extension/adhd-code-focus-0.1.2.vsix`。

## 工程结构

- `packages/core`：无 VS Code/浏览器依赖的标识符、加粗、分块、填空和朗读计划算法。
- `apps/extension`：VS Code Extension Host、装饰引擎、状态栏、命令和 Webview 安全桥。
- `apps/webview`：React 学习卡片、系统 TTS 和填空状态机。

当前分块采用可靠的行/空行降级算法；语言专用 AST/Tree-sitter 适配器属于下一迭代。
