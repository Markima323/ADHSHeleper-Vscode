import * as vscode from "vscode";
import type { LearningSessionDto, SourceRangeDto } from "@adhd-code-focus/core";

type WebviewMessage =
  | { type: "ready" }
  | { type: "source/reveal"; payload: { uri: string; range: SourceRangeDto } }
  | { type: "session/complete"; payload: { score: number; durationMs: number } }
  | { type: "tts/unavailable"; payload: { locale: string } };

export class LearningPanel {
  static open(context: vscode.ExtensionContext, session: LearningSessionDto): void {
    const panel = vscode.window.createWebviewPanel(
      "adhdCodeFocus.learning",
      "ADHD Code Focus · 学习模式",
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")] },
    );
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
      }
    });
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
