import { describe, expect, it } from "vitest";
import type { TokenSegment } from "@adhd-code-focus/core";
import { splitTokenSegmentsIntoLines } from "./AdhdText";

describe("line-aware code rendering", () => {
  it("keeps syntax segments intact while splitting multiline content", () => {
    const segments: TokenSegment[] = [
      { id: "c", text: "/* first\nsecond */", kind: "plain", boldRanges: [], syntaxKind: "comment" },
      { id: "w", text: "value", kind: "word", boldRanges: [{ start: 0, end: 2 }], syntaxKind: "identifier" },
    ];
    const lines = splitTokenSegmentsIntoLines(segments);
    expect(lines).toHaveLength(2);
    expect(lines[0]?.map((item) => item.text).join("")).toBe("/* first");
    expect(lines[1]?.map((item) => item.text).join("")).toBe("second */value");
    expect(lines[1]?.[0]?.segment.syntaxKind).toBe("comment");
  });
});
