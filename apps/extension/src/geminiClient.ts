import * as vscode from "vscode";
import {
  buildGeminiExplanationPrompt,
  extractDeepSeekExplanation,
  extractGeminiExplanation,
  formatExplanationLines,
} from "@adhd-code-focus/core";

export type AiProvider = "gemini" | "deepseek";
export type AiIdentity = { provider: AiProvider; model: string; label: "Gemini" | "DeepSeek" };

const secrets: Record<AiProvider, string> = {
  gemini: "adhdCodeFocus.geminiApiKey",
  deepseek: "adhdCodeFocus.deepseekApiKey",
};

export class AiClient {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getIdentity(): AiIdentity {
    const config = vscode.workspace.getConfiguration("adhdCodeFocus");
    const provider = config.get<AiProvider>("ai.provider", "gemini");
    return provider === "deepseek"
      ? { provider, model: config.get("deepseek.model", "deepseek-v4-flash"), label: "DeepSeek" }
      : { provider: "gemini", model: config.get("gemini.model", "gemini-3.5-flash"), label: "Gemini" };
  }

  async hasApiKey(provider = this.getIdentity().provider): Promise<boolean> {
    return Boolean(await this.context.secrets.get(secrets[provider]));
  }

  async configureApiKey(provider = this.getIdentity().provider): Promise<boolean> {
    const label = provider === "deepseek" ? "DeepSeek" : "Gemini";
    const value = await vscode.window.showInputBox({
      title: `设置 ${label} API Key`,
      prompt: `保存后，学习模式会将当前代码发送给 ${label} 生成简洁解释。`,
      placeHolder: `粘贴 ${label} API Key`,
      password: true,
      ignoreFocusOut: true,
      validateInput: (input) => input.trim().length < 10 ? "API Key 长度似乎不正确。" : undefined,
    });
    if (!value) return false;
    await this.context.secrets.store(secrets[provider], value.trim());
    return true;
  }

  async clearApiKey(provider = this.getIdentity().provider): Promise<void> {
    await this.context.secrets.delete(secrets[provider]);
  }

  async explain(languageId: string, code: string, signal?: AbortSignal): Promise<string> {
    const identity = this.getIdentity();
    const apiKey = await this.context.secrets.get(secrets[identity.provider]);
    if (!apiKey) throw new AiApiError("missing-key", `尚未配置 ${identity.label} API Key。`);
    return identity.provider === "deepseek"
      ? this.explainWithDeepSeek(identity, apiKey, languageId, code, signal)
      : this.explainWithGemini(identity, apiKey, languageId, code, signal);
  }

  private async explainWithGemini(
    identity: AiIdentity, apiKey: string, languageId: string, code: string, signal?: AbortSignal,
  ): Promise<string> {
    return this.request(identity, signal, async (requestSignal) => {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          model: identity.model,
          input: buildGeminiExplanationPrompt(languageId, code),
          store: false,
          generation_config: { thinking_level: "minimal" },
        }),
        signal: requestSignal,
      });
      const payload: unknown = await response.json().catch(() => undefined);
      if (!response.ok) throw apiErrorForStatus(identity, response.status, payload);
      return extractGeminiExplanation(payload);
    });
  }

  private async explainWithDeepSeek(
    identity: AiIdentity, apiKey: string, languageId: string, code: string, signal?: AbortSignal,
  ): Promise<string> {
    return this.request(identity, signal, async (requestSignal) => {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: identity.model,
          messages: [{ role: "user", content: buildGeminiExplanationPrompt(languageId, code) }],
          thinking: { type: "disabled" },
          stream: false,
        }),
        signal: requestSignal,
      });
      const payload: unknown = await response.json().catch(() => undefined);
      if (!response.ok) throw apiErrorForStatus(identity, response.status, payload);
      return extractDeepSeekExplanation(payload);
    });
  }

  private async request(
    identity: AiIdentity,
    signal: AbortSignal | undefined,
    run: (signal: AbortSignal) => Promise<string | undefined>,
  ): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      const explanation = await run(controller.signal);
      if (!explanation) throw new AiApiError("empty-response", `${identity.label} 没有返回可显示的解释。`);
      return formatExplanationLines(explanation);
    } catch (error) {
      if (error instanceof AiApiError) throw error;
      if (controller.signal.aborted) throw new AiApiError("timeout", "请求已取消或超过 20 秒。 ");
      throw new AiApiError("network", `无法连接 ${identity.label} API，请检查网络后重试。`);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
    }
  }
}

export class AiApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "AiApiError";
  }
}

function apiErrorForStatus(identity: AiIdentity, status: number, payload: unknown): AiApiError {
  if (status === 401 || status === 403) return new AiApiError("invalid-key", `${identity.label} API Key 无效或没有模型权限。`);
  if (status === 429) return new AiApiError("rate-limit", `${identity.label} 请求频率或额度已达到限制，请稍后重试。`);
  const apiMessage = payload && typeof payload === "object"
    ? (payload as { error?: { message?: unknown } }).error?.message
    : undefined;
  const detail = typeof apiMessage === "string" ? apiMessage.slice(0, 240) : `HTTP ${status}`;
  return new AiApiError("api-error", `${identity.label} API 请求失败：${detail}`);
}
