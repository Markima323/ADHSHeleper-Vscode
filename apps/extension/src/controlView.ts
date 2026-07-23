import * as vscode from "vscode";

type ControlMessage =
  | { type: "toggle" }
  | { type: "startLearning" }
  | { type: "ready" }
  | { type: "autoPlay/set"; payload: { enabled: boolean } };

type ControlState = { enabled: boolean; hasEditor: boolean; autoPlay: boolean };

export class ControlViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "adhdCodeFocus.controls";
  private view: vscode.WebviewView | undefined;

  constructor(private readonly readState: () => ControlState) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.html();
    view.webview.onDidReceiveMessage(async (message: ControlMessage) => {
      if (message.type === "toggle") {
        await vscode.commands.executeCommand("adhdCodeFocus.toggle");
      } else if (message.type === "startLearning") {
        await vscode.commands.executeCommand("adhdCodeFocus.startLearningSelection");
      } else if (message.type === "autoPlay/set" && typeof message.payload?.enabled === "boolean") {
        await vscode.workspace.getConfiguration("adhdCodeFocus").update(
          "tts.autoPlay",
          message.payload.enabled,
          vscode.ConfigurationTarget.Global,
        );
        this.update();
      } else if (message.type === "ready") {
        this.update();
      }
    });
  }

  update(): void {
    void this.view?.webview.postMessage({ type: "state", payload: this.readState() });
  }

  private html(): string {
    const nonce = randomNonce();
    return `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">
  body { padding: 14px; color: var(--vscode-foreground); font-family: var(--vscode-font-family); }
  h2 { margin: 0 0 5px; font-size: 14px; }
  p { margin: 0 0 16px; color: var(--vscode-descriptionForeground); line-height: 1.5; }
  .actions { display: grid; gap: 9px; }
  button { width: 100%; min-height: 36px; padding: 7px 10px; border: 1px solid var(--vscode-button-border, transparent); border-radius: 4px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); font: inherit; cursor: pointer; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button:disabled { opacity: .5; cursor: not-allowed; }
  button:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }
  .setting-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 15px; padding: 11px 0; border-top: 1px solid var(--vscode-widget-border, rgba(127,127,127,.25)); border-bottom: 1px solid var(--vscode-widget-border, rgba(127,127,127,.25)); }
  .setting-copy { min-width: 0; }
  .setting-copy strong { display: block; margin-bottom: 3px; font-size: 13px; }
  .setting-copy span { color: var(--vscode-descriptionForeground); font-size: 11px; line-height: 1.4; }
  .switch { position: relative; flex: 0 0 auto; width: 38px; height: 22px; }
  .switch input { position: absolute; width: 1px; height: 1px; opacity: 0; }
  .switch-track { position: absolute; inset: 0; border: 1px solid var(--vscode-widget-border, transparent); border-radius: 999px; background: var(--vscode-input-background); cursor: pointer; transition: background 120ms ease; }
  .switch-track::after { content: ''; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: var(--vscode-descriptionForeground); transition: transform 120ms ease, background 120ms ease; }
  .switch input:checked + .switch-track { background: var(--vscode-button-background); }
  .switch input:checked + .switch-track::after { transform: translateX(16px); background: var(--vscode-button-foreground); }
  .switch input:focus-visible + .switch-track { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }
  #status { margin-top: 13px; font-size: 12px; }
</style></head><body>
  <h2>ADHD Code Focus</h2>
  <p>先在编辑器中打开代码，再使用下面的操作。</p>
  <div class="actions">
    <button id="toggle" type="button">切换部分加粗</button>
    <button id="learn" class="secondary" type="button">开始学习</button>
  </div>
  <div class="setting-row">
    <div class="setting-copy"><strong>自动朗读</strong><span id="autoPlayText">打开卡片时自动播放英语语音</span></div>
    <label class="switch" title="切换自动朗读">
      <input id="autoPlay" type="checkbox" role="switch" aria-label="自动朗读" />
      <span class="switch-track" aria-hidden="true"></span>
    </label>
  </div>
  <p id="status" role="status">正在读取编辑器状态…</p>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const toggle = document.getElementById('toggle');
    const learn = document.getElementById('learn');
    const status = document.getElementById('status');
    const autoPlay = document.getElementById('autoPlay');
    const autoPlayText = document.getElementById('autoPlayText');
    toggle.addEventListener('click', () => vscode.postMessage({ type: 'toggle' }));
    learn.addEventListener('click', () => vscode.postMessage({ type: 'startLearning' }));
    autoPlay.addEventListener('change', () => vscode.postMessage({ type: 'autoPlay/set', payload: { enabled: autoPlay.checked } }));
    window.addEventListener('message', (event) => {
      if (event.data?.type !== 'state') return;
      const { enabled, hasEditor, autoPlay: autoPlayEnabled } = event.data.payload;
      toggle.disabled = !hasEditor;
      learn.disabled = !hasEditor;
      toggle.textContent = enabled ? '关闭部分加粗' : '启用部分加粗';
      autoPlay.checked = autoPlayEnabled;
      autoPlayText.textContent = autoPlayEnabled ? '打开卡片时自动播放英语语音' : '仅点击英语重播时播放';
      status.textContent = hasEditor ? ('部分加粗：' + (enabled ? '已开启' : '已关闭')) : '请先打开一个代码文件。';
    });
    vscode.postMessage({ type: 'ready' });
  </script>
</body></html>`;
  }
}

function randomNonce(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}
