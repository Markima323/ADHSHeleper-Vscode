# ADHD Code Focus

ADHD 友好的 VS Code 本地扩展：通过不修改源码的部分加粗建立视觉锚点，并把选区或当前函数转换为分块学习卡片。

## 使用

- `Ctrl/Cmd + Alt + B`：切换当前编辑器的部分加粗。
- `Ctrl/Cmd + Alt + L`：从选区（无选区时为当前文件）开始学习。
- 在代码行上右键选择“从此行开始学习”，从该行学习到文件末尾。
- 点击左侧活动栏的眼睛图标，可直接使用“切换部分加粗”和“开始学习”按钮。
- 在左侧“专注控制”面板的“AI 解释服务”下拉框中选择 Gemini 或 DeepSeek。
- 下拉框下方可显示、隐藏、添加或修改当前 AI 服务的 API Key。
- 命令面板运行 `ADHD Code Focus: Start Learning from Current Symbol`：学习光标所在函数或类。

基础能力完全本地运行，不上传源码。每张卡片会自动使用系统 Web Speech API 进行一次英语朗读；朗读时也可以填写空位。

开始学习后，插件会自动收起左侧主侧边栏、关闭来源代码标签，并在当前编辑器区域显示学习卡片。未保存的代码仍由 VS Code 询问是否保存。

AI 解释是可选联网功能。Gemini 使用 Interactions API 和 `store: false`；DeepSeek 使用 Chat Completions API，默认模型为 `deepseek-v4-flash`。只有当前卡片或点击圆点的代码行会发送给所选服务。两个 API Key 分别保存在 VS Code SecretStorage。

代码卡片和解释记录固定保存在 `D:\codeLearn`。相同文件、选区和源码再次学习时，会按 AI 服务和模型直接恢复对应记录；API Key 不会写入该目录。
