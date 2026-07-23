import * as vscode from "vscode";
import {
  buildGeminiExplanationPrompt,
  extractGeminiExplanation,
  formatExplanationLines,
} from "@adhd-code-focus/core";

const apiKeySecret = "adhdCodeFocus.geminiApiKey";
const endpoint = "https://generativelanguage.googleapis.com/v1beta/interactions";

export class GeminiClient {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async hasApiKey(): Promise<boolean> {
    return Boolean(await this.context.secrets.get(apiKeySecret));
  }

  async configureApiKey(): Promise<boolean> {
    const value = await vscode.window.showInputBox({
      title: "设置 Gemini API Key",
      prompt: "配置后，学习模式会将当前卡片代码发送给 Gemini 生成简洁解释。",
      placeHolder: "粘贴 Google AI Studio API Key",
      password: true,
      ignoreFocusOut: true,
      validateInput: (input) => input.trim().length < 20 ? "API Key 长度似乎不正确。" : undefined,
    });
    if (!value) return false;
    await this.context.secrets.store(apiKeySecret, value.trim());
    return true;
  }

  async clearApiKey(): Promise<void> {
    await this.context.secrets.delete(apiKeySecret);
  }

  async explain(languageId: string, code: string, signal?: AbortSignal): Promise<string> {
    const apiKey = await this.context.secrets.get(apiKeySecret);
    if (!apiKey) throw new GeminiApiError("missing-key", "尚未配置 Gemini API Key。");

    const model = vscode.workspace.getConfiguration("adhdCodeFocus").get("gemini.model", "gemini-3.5-flash");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          model,
          input: buildGeminiExplanationPrompt(languageId, code),
          store: false,
          generation_config: { thinking_level: "minimal" },
        }),
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => undefined);
      if (!response.ok) throw apiErrorForStatus(response.status, payload);
      const explanation = extractGeminiExplanation(payload);
      if (!explanation) throw new GeminiApiError("empty-response", "Gemini 没有返回可显示的解释。");
      return formatExplanationLines(explanation);
    } catch (error) {
      if (error instanceof GeminiApiError) throw error;
      if (controller.signal.aborted) throw new GeminiApiError("timeout", "请求已取消或超过 20 秒。");
      throw new GeminiApiError("network", "无法连接 Gemini API，请检查网络后重试。");
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
    }
  }
}

export class GeminiApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "GeminiApiError";
  }
}

function apiErrorForStatus(status: number, payload: unknown): GeminiApiError {
  if (status === 401 || status === 403) return new GeminiApiError("invalid-key", "API Key 无效或没有使用该模型的权限。");
  if (status === 429) return new GeminiApiError("rate-limit", "Gemini 请求频率或额度已达到限制，请稍后重试。");
  const apiMessage = payload && typeof payload === "object"
    ? (payload as { error?: { message?: unknown } }).error?.message
    : undefined;
  const detail = typeof apiMessage === "string" ? apiMessage.slice(0, 240) : `HTTP ${status}`;
  return new GeminiApiError("api-error", `Gemini API 请求失败：${detail}`);
}
