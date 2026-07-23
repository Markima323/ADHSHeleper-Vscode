# ADHD Code Focus

ADHD 友好的 VS Code 本地扩展：通过不修改源码的部分加粗建立视觉锚点，并把选区或当前函数转换为分块学习卡片。

## 使用

- `Ctrl/Cmd + Alt + B`：切换当前编辑器的部分加粗。
- `Ctrl/Cmd + Alt + L`：从选区（无选区时为当前文件）开始学习。
- 点击左侧活动栏的眼睛图标，可直接使用“切换部分加粗”和“开始学习”按钮。
- 命令面板运行 `ADHD Code Focus: Start Learning from Current Symbol`：学习光标所在函数或类。

基础能力完全本地运行，不上传源码。每张卡片会自动使用系统 Web Speech API 进行一次英语朗读；朗读时也可以填写空位。
