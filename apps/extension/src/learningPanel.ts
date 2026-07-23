import * as vscode from "vscode";
import type { LearningSessionDto, SourceRangeDto } from "@adhd-code-focus/core";
import { GeminiApiError, GeminiClient } from "./geminiClient.js";

type WebviewMessage =
  | { type: "ready" }
  | { type: "source/reveal"; payload: { uri: string; range: SourceRangeDto } }
  | { type: "session/complete"; payload: { score: number; durationMs: number } }
  | { type: "tts/unavailable"; payload: { locale: string } }
  | { type: "gemini/setup" }
  | { type: "gemini/explain"; payload: { chunkId: string } };

export class LearningPanel {
  static open(context: vscode.ExtensionContext, session: LearningSessionDto, gemini: GeminiClient): void {
    const panel = vscode.window.createWebviewPanel(
      "adhdCodeFocus.learning",
      "ADHD Code Focus · 学习模式",
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")] },
    );
    const explanationCache = new Map<string, Promise<string>>();
    const abortController = new AbortController();
    panel.webview.html = this.html(panel.webview, context.extensionUri);
    panel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      if (message.type === "ready") {
        await panel.webview.postMessage({ type: "session/init", payload: session });
      } else if (message.type === "source/reveal") {
        await this.revealSource(message.payload.uri, message.payload.range);
      } else if (message.type === "session/complete") {
        const history = context.globalState.get<Array<object>>("learningHistory", []);
        await context.globalState.update("learningHistory", [
          { sessionId: session.id, completedAt: new Date().toISOString(), ...message.payload },
          ...history,
        ].slice(0, 200));
      } else if (message.type === "tts/unavailable") {
        void vscode.window.showWarningMessage(`未找到 ${message.payload.locale} 英语系统语音，仍可使用文本和填空功能。`);
      } else if (message.type === "gemini/setup") {
        if (await gemini.configureApiKey()) {
          await panel.webview.postMessage({ type: "gemini/configured" });
          void vscode.window.showInformationMessage("Gemini API Key 已安全保存，可以生成卡片解释。 ");
        }
      } else if (message.type === "gemini/explain") {
        const chunk = session.chunks.find((item) => item.id === message.payload.chunkId);
        if (!chunk) return;
        if (!await gemini.hasApiKey()) {
          await panel.webview.postMessage({
            type: "gemini/explanation",
            payload: { chunkId: chunk.id, status: "needs-key" },
          });
          return;
        }
        let request = explanationCache.get(chunk.id);
        if (!request) {
          request = gemini.explain(chunk.languageId, chunk.code, abortController.signal);
          explanationCache.set(chunk.id, request);
        }
        try {
          const text = await request;
          await panel.webview.postMessage({
            type: "gemini/explanation",
            payload: { chunkId: chunk.id, status: "ready", text },
          });
        } catch (error) {
          explanationCache.delete(chunk.id);
          const messageText = error instanceof GeminiApiError ? error.message : "Gemini 解释生成失败，请重试。";
          await panel.webview.postMessage({
            type: "gemini/explanation",
            payload: { chunkId: chunk.id, status: "error", message: messageText },
          });
        }
      }
    });
    panel.onDidDispose(() => abortController.abort());
  }

  private static async revealSource(uriValue: string, range: SourceRangeDto): Promise<void> {
    const uri = vscode.Uri.parse(uriValue);
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    const selection = new vscode.Range(
      range.startLine, range.startCharacter, range.endLine, range.endCharacter,
    );
    editor.selection = new vscode.Selection(selection.start, selection.end);
    editor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  private static html(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "assets", "index.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "assets", "index.css"));
    const nonce = randomNonce();
    return `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8" />
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
