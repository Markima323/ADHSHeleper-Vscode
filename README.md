# ADHD Code Focus

这是依据 [`ADHD_Code_Focus_VSCode_开发文档_v0.1.docx`](./ADHD_Code_Focus_VSCode_开发文档_v0.1.docx) 实现的本地优先 VS Code 扩展 MVP。

## 已实现

- 仅在可视区域扫描并部分加粗标识符和注释，不修改源码。
- 支持 camelCase、PascalCase、snake_case、缩写、数字边界和 Unicode grapheme。
- 状态栏、命令面板和快捷键开关。
- 从选区、当前函数/类或当前文件创建分块学习卡片。
- 每卡最多 10 个代码词元的点击式填空，支持即时反馈、撤销和重置。
- 每张卡片自动使用系统 Web Speech API 进行一次英语代码朗读，朗读期间仍可填空。
- 可选 Gemini 简洁解释：只发送当前卡片代码，API Key 保存在 VS Code SecretStorage。
- 学习卡片和 Gemini 解释持久化到 `D:\codeLearn`，相同源码下次直接恢复。
- 学习代码与候选词使用 VS Code 当前主题的语法类别颜色。
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

输出位于 `apps/extension/adhd-code-focus-0.3.0.vsix`。

## Gemini 解释

学习卡片会在进度条下方显示“Gemini 简洁解释”。首次点击“设置 Gemini API Key”后，密钥会保存到 VS Code SecretStorage。之后每张卡片第一次显示时自动请求解释。

- 使用 Gemini Interactions API 和 `gemini-3.5-flash`。
- 请求设置 `store: false` 和 `thinking_level: minimal`。
- 只发送当前卡片的语言 ID 和代码，不发送文件路径、其他卡片或工作区内容。
- 代码和解释不会写入本地学习记录；面板关闭后内存缓存释放。
- 可通过命令面板运行 `ADHD Code Focus: Clear Gemini API Key` 删除密钥。

## 本地学习记录

- 固定保存在 `D:\codeLearn`，不会把卡片记录写入 C 盘。
- 新版不再使用 VS Code globalState 保存会话摘要，并会清除旧版的摘要键。
- 每个源文件对应一个以源 URI SHA-256 命名的 JSON 文件。
- JSON 保存卡片代码、源码范围、填空模型、解释文本、模型和更新时间。
- Gemini 提示词优先解释关键函数/方法、参数和返回值；解释文本也应用中文词语级部分加粗。
- 再次学习同一文件、相同选区和相同源码时，直接恢复原卡片；已有解释不会再次请求 Gemini。
- 源码或选区变化时创建新的会话记录，避免复用过期解释。
- 运行 `ADHD Code Focus: Open Learning Records Folder` 可以打开记录目录。

## 工程结构

- `packages/core`：无 VS Code/浏览器依赖的标识符、加粗、分块、填空和朗读计划算法。
- `apps/extension`：VS Code Extension Host、装饰引擎、状态栏、命令和 Webview 安全桥。
- `apps/webview`：React 学习卡片、系统 TTS 和填空状态机。

当前分块采用可靠的行/空行降级算法；语言专用 AST/Tree-sitter 适配器属于下一迭代。
