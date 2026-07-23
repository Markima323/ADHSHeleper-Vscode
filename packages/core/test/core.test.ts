import { describe, expect, it } from "vitest";
import { buildEnglishNarration, calculateBoldRanges, chunkByLines, createClozeQuiz, splitIdentifier } from "../src/index.js";
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
