import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LearningSessionDto } from "@adhd-code-focus/core";
import { LearningRecordStore } from "./learningRecordStore.js";

const testRoot = resolve("D:\\codeLearn");
let testDirectory: string | undefined;

afterEach(async () => {
  if (!testDirectory) return;
  const resolved = resolve(testDirectory);
  if (!resolved.startsWith(`${testRoot}${sep}`)) throw new Error("拒绝清理预期目录之外的测试数据。");
  await rm(resolved, { recursive: true, force: true });
  testDirectory = undefined;
});

describe("learning record store", () => {
  it("restores cards and explanations for identical source", async () => {
    await mkdir(testRoot, { recursive: true });
    testDirectory = await mkdtemp(join(testRoot, ".record-test-"));
    const store = new LearningRecordStore(testDirectory);
    const original = session("session-1");
    const first = await store.open("file:///D:/project/example.ts", "same source", original);
    await first.saveExplanation("chunk-1", "这段代码返回总数。", "gemini", "gemini-3.5-flash");
    await first.saveLineExplanation("chunk-1:line:0", "这一行返回总数。", "gemini", "gemini-3.5-flash");

    const restored = await store.open("file:///D:/project/example.ts", "same source", session("session-2"));
    expect(restored.session.id).toBe("session-2");
    expect(restored.session.chunks[0]?.code).toBe("return total;");
    expect(restored.getExplanation("chunk-1", "gemini", "gemini-3.5-flash")).toBe("这段代码返回总数。");
    expect(restored.getLineExplanation("chunk-1:line:0", "gemini", "gemini-3.5-flash")).toBe("这一行返回总数。");
    expect(restored.getExplanation("chunk-1", "deepseek", "deepseek-v4-flash")).toBeUndefined();
    expect(await readdir(testDirectory)).toHaveLength(1);
  });
});

function session(id: string): LearningSessionDto {
  return {
    id,
    createdAt: "2026-07-23T00:00:00.000Z",
    settings: { boldRatio: 0.42, ttsLocale: "en-US", ttsRate: 0.9, ttsAutoPlay: true },
    chunks: [{
      id: "chunk-1",
      title: "Card 1",
      languageId: "typescript",
      sourceUri: "file:///D:/project/example.ts",
      sourceRange: { startLine: 0, startCharacter: 0, endLine: 0, endCharacter: 13 },
      code: "return total;",
      tokenSegments: [],
      quiz: { seed: "seed", blanks: [], choices: [], maxBlankCount: 6 },
      narrationText: "return, total",
    }],
  };
}
