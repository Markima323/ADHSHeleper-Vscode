import { describe, expect, it } from "vitest";
import {
  buildEnglishNarration,
  buildGeminiExplanationPrompt,
  buildTokenSegments,
  calculateBoldRanges,
  chunkByLines,
  createClozeQuiz,
  extractGeminiExplanation,
  extractDeepSeekExplanation,
  formatExplanationLines,
  splitIdentifier,
} from "../src/index.js";
import type { TokenSegment } from "../src/index.js";

describe("identifier splitting", () => {
  it("handles camel case, acronym, snake case and digits", () => {
    const parts = (value: string) => splitIdentifier(value).map((range) => value.slice(range.start, range.end));
    expect(parts("calculateTotal")).toEqual(["calculate", "Total"]);
    expect(parts("HTTPResponseCode")).toEqual(["HTTP", "Response", "Code"]);
    expect(parts("user_profile_id")).toEqual(["user", "profile", "id"]);
    expect(parts("item2Count")).toEqual(["item", "2", "Count"]);
  });

  it("calculates UTF-16-safe partial ranges", () => {
    expect(calculateBoldRanges("calculateTotal", {
      boldRatio: 0.42, minTokenLength: 3, maxBoldChars: 6,
    })).toEqual([{ start: 0, end: 4 }, { start: 9, end: 12 }]);
  });
});

describe("cloze generation", () => {
  it("is deterministic, ordered by source and capped", () => {
    const segments: TokenSegment[] = Array.from({ length: 12 }, (_, index) => ({
      id: `w-${index}`, text: `token${index}`, kind: "word", boldRanges: [],
    }));
    const first = createClozeQuiz(segments, 10, "stable-seed");
    const second = createClozeQuiz(segments, 10, "stable-seed");
    expect(first).toEqual(second);
    expect(first.blanks).toHaveLength(10);
    expect(first.blanks.map((blank) => blank.segmentIndex)).toEqual(
      [...first.blanks.map((blank) => blank.segmentIndex)].sort((a, b) => a - b),
    );
  });
});

describe("fallback chunking", () => {
  it("never exceeds the line cap", () => {
    const chunks = chunkByLines(Array.from({ length: 53 }, (_, i) => `line ${i}`).join("\n"), 0, 24);
    expect(chunks).toHaveLength(3);
    expect(chunks.every((chunk) => chunk.code.split("\n").length <= 24)).toBe(true);
  });
});

describe("English narration", () => {
  it("splits camel-case identifiers into speakable words", () => {
    expect(buildEnglishNarration([
      { id: "1", text: "function", kind: "word", boldRanges: [] },
      { id: "2", text: "calculateTotal", kind: "word", boldRanges: [] },
    ])).toBe("function, calculate, Total");
  });
});

describe("Gemini explanation helpers", () => {
  it("marks source code as untrusted data in the prompt", () => {
    const prompt = buildGeminiExplanationPrompt("typescript", "return total;");
    expect(prompt).toContain("不可信数据");
    expect(prompt).toContain("函数与方法");
    expect(prompt).toContain("关键参数和返回值");
    expect(prompt).toContain("<code>\nreturn total;\n</code>");
  });

  it("extracts only model text output", () => {
    expect(extractGeminiExplanation({
      steps: [
        { type: "thought", content: [{ type: "text", text: "hidden" }] },
        { type: "model_output", content: [{ type: "text", text: "  简洁解释。 " }] },
      ],
    })).toBe("简洁解释。");
  });

  it("places every Chinese sentence after a full stop on a new line", () => {
    expect(formatExplanationLines("第一句。 第二句。第三句。"))
      .toBe("第一句。\n第二句。\n第三句。");
  });
});

describe("DeepSeek explanation helpers", () => {
  it("extracts assistant message content", () => {
    expect(extractDeepSeekExplanation({
      choices: [{ message: { role: "assistant", content: "  简洁解释。 " } }],
    })).toBe("简洁解释。");
  });

  it("rejects malformed responses", () => {
    expect(extractDeepSeekExplanation({ choices: [] })).toBeUndefined();
  });
});

describe("syntax-colored learning tokens", () => {
  it("classifies code and carries colors into cloze choices", () => {
    const segments = buildTokenSegments(
      'const total = calculate(items.length, "EUR"); // final value',
      { boldRatio: 0.42, minTokenLength: 3, maxBoldChars: 6 },
    );
    expect(segments.find((item) => item.text === "const")?.syntaxKind).toBe("keyword");
    expect(segments.find((item) => item.text === "calculate")?.syntaxKind).toBe("function");
    expect(segments.find((item) => item.text === "length")?.syntaxKind).toBe("property");
    expect(segments.find((item) => item.text === '"EUR"')?.syntaxKind).toBe("string");
    expect(segments.find((item) => item.text.startsWith("//"))?.syntaxKind).toBe("comment");

    const quiz = createClozeQuiz(segments, 6, "syntax-seed");
    expect(quiz.choices.every((choice) => choice.syntaxKind !== undefined)).toBe(true);
  });
});
