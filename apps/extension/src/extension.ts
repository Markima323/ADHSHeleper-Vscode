import * as vscode from "vscode";
import { ControlViewProvider } from "./controlView.js";
import { DecorationEngine } from "./decorationEngine.js";
import { AiClient } from "./geminiClient.js";
import { LearningPanel } from "./learningPanel.js";
import { LearningRecordStore, getLearningRecordDirectory } from "./learningRecordStore.js";
import type { OpenedLearningRecord } from "./learningRecordStore.js";
import {
  buildLearningSession,
  sourceForCurrentSymbol,
  sourceForSelectionOrDocument,
  sourceFromLineToDocumentEnd,
} from "./session.js";

export function activate(context: vscode.ExtensionContext): void {
  // v0.2.2+: learning records live exclusively in D:\codeLearn.
  void context.globalState.update("learningHistory", undefined);
  const engine = new DecorationEngine();
  const ai = new AiClient(context);
  const records = new LearningRecordStore();
  const controls = new ControlViewProvider(
    () => {
      const editor = vscode.window.activeTextEditor;
      const autoPlay = vscode.workspace.getConfiguration("adhdCodeFocus").get("tts.autoPlay", true);
      const aiProvider = vscode.workspace.getConfiguration("adhdCodeFocus").get<"gemini" | "deepseek">("ai.provider", "gemini");
      return { enabled: editor ? engine.isEnabled(editor) : false, hasEditor: Boolean(editor), autoPlay, aiProvider };
    },
    (provider) => ai.getApiKey(provider),
    (provider, value) => ai.saveApiKey(provider, value),
  );
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = "adhdCodeFocus.toggle";
  status.tooltip = "切换当前编辑器的 ADHD 部分加粗";

  const updateStatus = (editor = vscode.window.activeTextEditor): void => {
    status.text = editor && engine.isEnabled(editor) ? "$(eye) Focus" : "$(eye-closed) Focus";
    status.show();
    controls.update();
  };
  const refreshActive = (): void => {
    const editor = vscode.window.activeTextEditor;
    if (editor) engine.schedule(editor);
    updateStatus(editor);
  };
  const startLearning = async (mode: "selection" | "symbol" | "line"): Promise<void> => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage("请先打开一个代码文件，再开始学习。");
      return;
    }
    try {
      const source = mode === "symbol"
        ? await sourceForCurrentSymbol(editor)
        : mode === "line"
          ? sourceFromLineToDocumentEnd(editor)
          : sourceForSelectionOrDocument(editor);
      if (!source.code.trim()) {
        void vscode.window.showInformationMessage("请选择包含代码的范围后再开始学习。");
        return;
      }
      const freshSession = buildLearningSession(editor.document, source);
      let record: OpenedLearningRecord | undefined;
      try {
        const sourceIdentity = [
          source.range.start.line,
          source.range.start.character,
          source.range.end.line,
          source.range.end.character,
          source.code,
        ].join("\u0000");
        record = await records.open(editor.document.uri.toString(), sourceIdentity, freshSession);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        void vscode.window.showWarningMessage(`无法使用 ${getLearningRecordDirectory()} 的本地记录：${detail}`);
      }
      await enterLearningLayout(editor.document.uri);
      LearningPanel.open(context, record?.session ?? freshSession, ai, record);
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
    vscode.commands.registerCommand("adhdCodeFocus.startLearningFromLine", () => startLearning("line")),
    vscode.commands.registerCommand("adhdCodeFocus.previewIntensity", () => {
      void vscode.commands.executeCommand("workbench.action.openSettings", "@ext:adhd-code-focus.adhd-code-focus boldRatio");
    }),
    vscode.commands.registerCommand("adhdCodeFocus.resetLocalProgress", async () => {
      await context.globalState.update("learningHistory", undefined);
      void vscode.window.showInformationMessage("ADHD Code Focus 本地学习记录已清除。 ");
    }),
    vscode.commands.registerCommand("adhdCodeFocus.setGeminiApiKey", async () => {
      if (await ai.configureApiKey("gemini")) {
        void vscode.window.showInformationMessage("Gemini API Key 已安全保存。 ");
      }
    }),
    vscode.commands.registerCommand("adhdCodeFocus.clearGeminiApiKey", async () => {
      await ai.clearApiKey("gemini");
      void vscode.window.showInformationMessage("Gemini API Key 已从 VS Code 安全存储中删除。 ");
    }),
    vscode.commands.registerCommand("adhdCodeFocus.setDeepSeekApiKey", async () => {
      if (await ai.configureApiKey("deepseek")) {
        void vscode.window.showInformationMessage("DeepSeek API Key 已安全保存。 ");
      }
    }),
    vscode.commands.registerCommand("adhdCodeFocus.clearDeepSeekApiKey", async () => {
      await ai.clearApiKey("deepseek");
      void vscode.window.showInformationMessage("DeepSeek API Key 已从 VS Code 安全存储中删除。 ");
    }),
    vscode.commands.registerCommand("adhdCodeFocus.openLearningRecords", async () => {
      const directory = vscode.Uri.file(getLearningRecordDirectory());
      await vscode.workspace.fs.createDirectory(directory);
      await vscode.env.openExternal(directory);
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

async function enterLearningLayout(sourceUri: vscode.Uri): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.closeSidebar");
  const sourceTabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs).filter((tab) =>
    tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === sourceUri.toString(),
  );
  if (sourceTabs.length > 0) await vscode.window.tabGroups.close(sourceTabs, true);
  await vscode.commands.executeCommand("workbench.action.joinAllGroups");
}
