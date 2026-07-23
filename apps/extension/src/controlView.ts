import * as vscode from "vscode";

type ControlMessage =
  | { type: "toggle" }
  | { type: "startLearning" }
  | { type: "ready" }
  | { type: "autoPlay/set"; payload: { enabled: boolean } }
  | { type: "aiProvider/set"; payload: { provider: "gemini" | "deepseek" } }
  | { type: "apiKey/save"; payload: { provider: "gemini" | "deepseek"; value: string } };

type ControlState = { enabled: boolean; hasEditor: boolean; autoPlay: boolean; aiProvider: "gemini" | "deepseek" };

export class ControlViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "adhdCodeFocus.controls";
  private view: vscode.WebviewView | undefined;
  private updateRevision = 0;

  constructor(
    private readonly readState: () => ControlState,
    private readonly readApiKey: (provider: "gemini" | "deepseek") => Promise<string>,
    private readonly saveApiKey: (provider: "gemini" | "deepseek", value: string) => Promise<void>,
  ) {}

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
      } else if (message.type === "aiProvider/set"
        && (message.payload?.provider === "gemini" || message.payload?.provider === "deepseek")) {
        await vscode.workspace.getConfiguration("adhdCodeFocus").update(
          "ai.provider",
          message.payload.provider,
          vscode.ConfigurationTarget.Global,
        );
        this.update();
      } else if (message.type === "apiKey/save"
        && (message.payload?.provider === "gemini" || message.payload?.provider === "deepseek")
        && typeof message.payload?.value === "string") {
        try {
          await this.saveApiKey(message.payload.provider, message.payload.value);
          await view.webview.postMessage({ type: "apiKey/result", payload: { ok: true, message: "API Key 已安全保存。" } });
          this.update();
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          await view.webview.postMessage({ type: "apiKey/result", payload: { ok: false, message: detail } });
        }
      } else if (message.type === "ready") {
        this.update();
      }
    });
  }

  update(): void {
    const view = this.view;
    if (!view) return;
    const revision = ++this.updateRevision;
    const state = this.readState();
    void this.readApiKey(state.aiProvider).then(async (apiKey) => {
      if (revision !== this.updateRevision || view !== this.view) return;
      await view.webview.postMessage({ type: "state", payload: { ...state, apiKey } });
    });
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
  .provider-row { margin-top: 15px; }
  .provider-row label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600; }
  select { width: 100%; min-height: 32px; padding: 4px 8px; color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border); border-radius: 3px; font: inherit; }
  select:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  .key-manager { margin-top: 11px; }
  .key-manager > label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600; }
  .key-input-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; }
  input[type='password'], input[type='text'] { min-width: 0; min-height: 32px; box-sizing: border-box; padding: 4px 8px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); border-radius: 3px; font: inherit; }
  input[type='password']:focus, input[type='text']:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  button.compact { width: auto; min-height: 32px; padding: 4px 9px; }
  #saveApiKey { margin-top: 7px; min-height: 32px; }
  #keyStatus { min-height: 17px; margin: 6px 0 0; font-size: 11px; }
  #keyStatus.error { color: var(--vscode-errorForeground); }
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
  <div class="provider-row">
    <label for="aiProvider">AI 解释服务</label>
    <select id="aiProvider" aria-label="选择 AI 解释服务">
      <option value="gemini">Gemini</option>
      <option value="deepseek">DeepSeek</option>
    </select>
  </div>
  <div class="key-manager">
    <label id="apiKeyLabel" for="apiKey">Gemini API 密钥</label>
    <div class="key-input-row">
      <input id="apiKey" type="password" autocomplete="off" spellcheck="false" aria-describedby="keyStatus" />
      <button id="revealApiKey" class="secondary compact" type="button" aria-label="显示 API 密钥">显示</button>
    </div>
    <button id="saveApiKey" class="secondary" type="button">保存密钥</button>
    <p id="keyStatus" role="status"></p>
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
    const aiProvider = document.getElementById('aiProvider');
    const apiKey = document.getElementById('apiKey');
    const apiKeyLabel = document.getElementById('apiKeyLabel');
    const revealApiKey = document.getElementById('revealApiKey');
    const saveApiKey = document.getElementById('saveApiKey');
    const keyStatus = document.getElementById('keyStatus');
    toggle.addEventListener('click', () => vscode.postMessage({ type: 'toggle' }));
    learn.addEventListener('click', () => vscode.postMessage({ type: 'startLearning' }));
    autoPlay.addEventListener('change', () => vscode.postMessage({ type: 'autoPlay/set', payload: { enabled: autoPlay.checked } }));
    aiProvider.addEventListener('change', () => {
      apiKey.value = '';
      apiKey.disabled = true;
      saveApiKey.disabled = true;
      keyStatus.textContent = '正在读取对应密钥…';
      vscode.postMessage({ type: 'aiProvider/set', payload: { provider: aiProvider.value } });
    });
    revealApiKey.addEventListener('click', () => {
      const showing = apiKey.type === 'text';
      apiKey.type = showing ? 'password' : 'text';
      revealApiKey.textContent = showing ? '显示' : '隐藏';
      revealApiKey.setAttribute('aria-label', showing ? '显示 API 密钥' : '隐藏 API 密钥');
    });
    saveApiKey.addEventListener('click', () => {
      keyStatus.className = '';
      keyStatus.textContent = '正在保存…';
      saveApiKey.disabled = true;
      vscode.postMessage({ type: 'apiKey/save', payload: { provider: aiProvider.value, value: apiKey.value } });
    });
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'apiKey/result') {
        saveApiKey.disabled = false;
        keyStatus.className = event.data.payload.ok ? '' : 'error';
        keyStatus.textContent = event.data.payload.message;
        return;
      }
      if (event.data?.type !== 'state') return;
      const { enabled, hasEditor, autoPlay: autoPlayEnabled, aiProvider: selectedProvider, apiKey: storedApiKey } = event.data.payload;
      toggle.disabled = !hasEditor;
      learn.disabled = !hasEditor;
      toggle.textContent = enabled ? '关闭部分加粗' : '启用部分加粗';
      autoPlay.checked = autoPlayEnabled;
      aiProvider.value = selectedProvider;
      apiKeyLabel.textContent = (selectedProvider === 'deepseek' ? 'DeepSeek' : 'Gemini') + ' API 密钥';
      apiKey.value = storedApiKey || '';
      apiKey.disabled = false;
      apiKey.type = 'password';
      revealApiKey.textContent = '显示';
      revealApiKey.setAttribute('aria-label', '显示 API 密钥');
      saveApiKey.disabled = false;
      keyStatus.className = '';
      keyStatus.textContent = storedApiKey ? '已读取当前服务的密钥。' : '尚未配置，可在此添加。';
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
