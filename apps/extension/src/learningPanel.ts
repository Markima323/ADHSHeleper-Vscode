import * as vscode from "vscode";
import type { LearningSessionDto, SourceRangeDto } from "@adhd-code-focus/core";
import { AiApiError, AiClient } from "./geminiClient.js";
import type { OpenedLearningRecord } from "./learningRecordStore.js";

type WebviewMessage =
  | { type: "ready" }
  | { type: "source/reveal"; payload: { uri: string; range: SourceRangeDto } }
  | { type: "session/complete"; payload: { score: number; durationMs: number } }
  | { type: "tts/unavailable"; payload: { locale: string } }
  | { type: "ai/setup" }
  | { type: "ai/explain"; payload: { chunkId: string } }
  | { type: "ai/explain-line"; payload: { chunkId: string; lineIndex: number } };

export class LearningPanel {
  static open(
    context: vscode.ExtensionContext,
    session: LearningSessionDto,
    ai: AiClient,
    record?: OpenedLearningRecord,
  ): void {
    const panel = vscode.window.createWebviewPanel(
      "adhdCodeFocus.learning",
      "ADHD Code Focus · 学习模式",
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")] },
    );
    const requestCache = new Map<string, Promise<string>>();
    const abortController = new AbortController();
    panel.webview.html = this.html(panel.webview, context.extensionUri);

    const providerPayload = () => {
      const identity = ai.getIdentity();
      return { provider: identity.provider, label: identity.label, model: identity.model };
    };

    panel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      if (message.type === "ready") {
        await panel.webview.postMessage({
          type: "session/init",
          payload: { session, ai: providerPayload() },
        });
      } else if (message.type === "source/reveal") {
        await this.revealSource(message.payload.uri, message.payload.range);
      } else if (message.type === "tts/unavailable") {
        void vscode.window.showWarningMessage(`未找到 ${message.payload.locale} 英语系统语音，仍可使用文本和填空功能。`);
      } else if (message.type === "ai/setup") {
        const identity = ai.getIdentity();
        if (await ai.configureApiKey(identity.provider)) {
          await panel.webview.postMessage({ type: "ai/configured" });
          void vscode.window.showInformationMessage(`${identity.label} API Key 已安全保存，可以生成代码解释。`);
        }
      } else if (message.type === "ai/explain") {
        const chunk = session.chunks.find((item) => item.id === message.payload.chunkId);
        if (!chunk) return;
        const identity = ai.getIdentity();
        const cachedText = record?.getExplanation(chunk.id, identity.provider, identity.model);
        if (cachedText) {
          await panel.webview.postMessage({
            type: "ai/explanation",
            payload: { chunkId: chunk.id, provider: identity.provider, status: "ready", text: cachedText, source: "local" },
          });
          return;
        }
        if (!await ai.hasApiKey(identity.provider)) {
          await panel.webview.postMessage({ type: "ai/explanation", payload: { chunkId: chunk.id, provider: identity.provider, status: "needs-key" } });
          return;
        }
        const cacheKey = `chunk:${chunk.id}:${identity.provider}:${identity.model}`;
        let request = requestCache.get(cacheKey);
        if (!request) {
          request = ai.explain(chunk.languageId, chunk.code, abortController.signal);
          requestCache.set(cacheKey, request);
        }
        try {
          const text = await request;
          if (record) await this.save(record.saveExplanation(chunk.id, text, identity.provider, identity.model), identity.label);
          await panel.webview.postMessage({
            type: "ai/explanation",
            payload: { chunkId: chunk.id, provider: identity.provider, status: "ready", text, source: "api" },
          });
        } catch (error) {
          requestCache.delete(cacheKey);
          const messageText = error instanceof AiApiError ? error.message : `${identity.label} 解释生成失败，请重试。`;
          await panel.webview.postMessage({ type: "ai/explanation", payload: { chunkId: chunk.id, provider: identity.provider, status: "error", message: messageText } });
        }
      } else if (message.type === "ai/explain-line") {
        const chunk = session.chunks.find((item) => item.id === message.payload.chunkId);
        const lines = chunk?.code.split("\n") ?? [];
        const lineIndex = message.payload.lineIndex;
        if (!chunk || !Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= lines.length) return;
        const lineCode = lines[lineIndex] ?? "";
        const lineKey = `${chunk.id}:line:${lineIndex}`;
        const identity = ai.getIdentity();
        const cachedText = record?.getLineExplanation(lineKey, identity.provider, identity.model);
        if (cachedText) {
          await panel.webview.postMessage({
            type: "ai/line-explanation",
            payload: { chunkId: chunk.id, lineIndex, provider: identity.provider, status: "ready", text: cachedText, source: "local" },
          });
          return;
        }
        if (!lineCode.trim()) {
          await panel.webview.postMessage({ type: "ai/line-explanation", payload: { chunkId: chunk.id, lineIndex, provider: identity.provider, status: "error", message: "这一行没有可解释的代码。" } });
          return;
        }
        if (!await ai.hasApiKey(identity.provider)) {
          await panel.webview.postMessage({ type: "ai/line-explanation", payload: { chunkId: chunk.id, lineIndex, provider: identity.provider, status: "needs-key" } });
          return;
        }
        const cacheKey = `line:${lineKey}:${identity.provider}:${identity.model}`;
        let request = requestCache.get(cacheKey);
        if (!request) {
          request = ai.explain(chunk.languageId, lineCode, abortController.signal);
          requestCache.set(cacheKey, request);
        }
        try {
          const text = await request;
          if (record) await this.save(record.saveLineExplanation(lineKey, text, identity.provider, identity.model), identity.label);
          await panel.webview.postMessage({
            type: "ai/line-explanation",
            payload: { chunkId: chunk.id, lineIndex, provider: identity.provider, status: "ready", text, source: "api" },
          });
        } catch (error) {
          requestCache.delete(cacheKey);
          const messageText = error instanceof AiApiError ? error.message : `${identity.label} 行级解释生成失败，请重试。`;
          await panel.webview.postMessage({ type: "ai/line-explanation", payload: { chunkId: chunk.id, lineIndex, provider: identity.provider, status: "error", message: messageText } });
        }
      }
    });

    const settingsListener = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("adhdCodeFocus.tts.autoPlay")) {
        const ttsAutoPlay = vscode.workspace.getConfiguration("adhdCodeFocus").get("tts.autoPlay", true);
        void panel.webview.postMessage({ type: "settings/update", payload: { ttsAutoPlay } });
      }
      if (event.affectsConfiguration("adhdCodeFocus.ai.provider")
        || event.affectsConfiguration("adhdCodeFocus.gemini.model")
        || event.affectsConfiguration("adhdCodeFocus.deepseek.model")) {
        void panel.webview.postMessage({ type: "ai/provider-update", payload: providerPayload() });
      }
    });
    panel.onDidDispose(() => {
      abortController.abort();
      settingsListener.dispose();
    });
  }

  private static async save(operation: Promise<void>, label: string): Promise<void> {
    try {
      await operation;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      void vscode.window.showWarningMessage(`${label} 解释已生成，但保存到 D:\\codeLearn 失败：${detail}`);
    }
  }

  private static async revealSource(uriValue: string, range: SourceRangeDto): Promise<void> {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(uriValue));
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    const selection = new vscode.Range(range.startLine, range.startCharacter, range.endLine, range.endCharacter);
    editor.selection = new vscode.Selection(selection.start, selection.end);
    editor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  private static html(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "assets", "index.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "assets", "index.css"));
    const nonce = randomNonce();
    return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
<link rel="stylesheet" href="${styleUri}" /><title>ADHD Code Focus</title></head>
<body><div id="root"></div><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
  }
}

function randomNonce(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}
