import * as vscode from "vscode";
import { ControlViewProvider } from "./controlView.js";
import { DecorationEngine } from "./decorationEngine.js";
import { GeminiClient } from "./geminiClient.js";
import { LearningPanel } from "./learningPanel.js";
import { buildLearningSession, sourceForCurrentSymbol, sourceForSelectionOrDocument } from "./session.js";

export function activate(context: vscode.ExtensionContext): void {
  const engine = new DecorationEngine();
  const gemini = new GeminiClient(context);
  const controls = new ControlViewProvider(() => {
    const editor = vscode.window.activeTextEditor;
    return { enabled: editor ? engine.isEnabled(editor) : false, hasEditor: Boolean(editor) };
  });
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = "adhdCodeFocus.toggle";
  status.tooltip = "切换当前编辑器的 ADHD 部分加粗";

  const updateStatus = (editor = vscode.window.activeTextEditor): void => {
    status.text = editor && engine.isEnabled(editor) ? "$(eye) Focus" : "$(eye-closed) Focus";
    status.show();
    controls.update(editor ? engine.isEnabled(editor) : false, Boolean(editor));
  };
  const refreshActive = (): void => {
    const editor = vscode.window.activeTextEditor;
    if (editor) engine.schedule(editor);
    updateStatus(editor);
  };
  const startLearning = async (mode: "selection" | "symbol"): Promise<void> => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage("请先打开一个代码文件，再开始学习。");
      return;
    }
    try {
      const source = mode === "symbol" ? await sourceForCurrentSymbol(editor) : sourceForSelectionOrDocument(editor);
      if (!source.code.trim()) {
        void vscode.window.showInformationMessage("请选择包含代码的范围后再开始学习。");
        return;
      }
      LearningPanel.open(context, buildLearningSession(editor.document, source), gemini);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`ADHD Code Focus 无法打开学习面板：${detail}`);
    }
  };

  context.subscriptions.push(
    engine,
    status,
    vscode.window.registerWebviewViewProvider(ControlViewProvider.viewType, controls),
    vscode.commands.registerCommand("adhdCodeFocus.toggle", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        void vscode.window.showInformationMessage("请先打开一个代码文件，再切换部分加粗。");
        return;
      }
      const enabled = engine.toggle(editor);
      updateStatus(editor);
      void vscode.window.setStatusBarMessage(`ADHD Code Focus 已${enabled ? "启用" : "关闭"}`, 1800);
    }),
    vscode.commands.registerCommand("adhdCodeFocus.startLearningSelection", () => startLearning("selection")),
    vscode.commands.registerCommand("adhdCodeFocus.startLearningSymbol", () => startLearning("symbol")),
    vscode.commands.registerCommand("adhdCodeFocus.previewIntensity", () => {
      void vscode.commands.executeCommand("workbench.action.openSettings", "@ext:adhd-code-focus.adhd-code-focus boldRatio");
    }),
    vscode.commands.registerCommand("adhdCodeFocus.resetLocalProgress", async () => {
      await context.globalState.update("learningHistory", undefined);
      void vscode.window.showInformationMessage("ADHD Code Focus 本地学习记录已清除。 ");
    }),
    vscode.commands.registerCommand("adhdCodeFocus.setGeminiApiKey", async () => {
      if (await gemini.configureApiKey()) {
        void vscode.window.showInformationMessage("Gemini API Key 已安全保存。 ");
      }
    }),
    vscode.commands.registerCommand("adhdCodeFocus.clearGeminiApiKey", async () => {
      await gemini.clearApiKey();
      void vscode.window.showInformationMessage("Gemini API Key 已从 VS Code 安全存储中删除。 ");
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) engine.schedule(editor, 0);
      updateStatus(editor);
    }),
    vscode.window.onDidChangeTextEditorVisibleRanges((event) => engine.schedule(event.textEditor)),
    vscode.workspace.onDidChangeTextDocument((event) => {
      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document === event.document) engine.schedule(editor);
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("adhdCodeFocus")) refreshActive();
    }),
  );
  refreshActive();
}

export function deactivate(): void {}
