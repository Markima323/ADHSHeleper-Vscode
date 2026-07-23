import { calculateBoldRanges, type BoldOptions } from "./identifier.js";
import type { OffsetRange, TokenSegment } from "./types.js";

export type ScannedWord = {
  text: string;
  start: number;
  end: number;
  kind: "identifier" | "keyword" | "comment" | "string";
};

const commonKeywords = new Set([
  "as", "async", "await", "break", "case", "catch", "class", "const", "continue",
  "default", "delete", "do", "else", "enum", "export", "extends", "false", "finally",
  "for", "from", "function", "if", "implements", "import", "in", "instanceof", "interface",
  "let", "new", "null", "of", "package", "private", "protected", "public", "return",
  "static", "super", "switch", "this", "throw", "true", "try", "type", "typeof",
  "undefined", "var", "void", "while", "with", "yield",
]);

const wordPattern = /[$_\p{L}][$_\p{L}\p{N}]*/gu;

/** Lightweight scanner. It is deliberately conservative and never changes source text. */
export function scanCodeWords(
  code: string,
  options: { includeComments: boolean; includeStrings: boolean; includeKeywords?: boolean },
): ScannedWord[] {
  const words: ScannedWord[] = [];
  let index = 0;
  let state: "code" | "lineComment" | "blockComment" | "string" = "code";
  let quote = "";

  while (index < code.length) {
    const current = code[index] ?? "";
    const next = code[index + 1] ?? "";
    if (state === "code" && current === "/" && next === "/") {
      state = "lineComment";
      index += 2;
      continue;
    }
    if (state === "code" && current === "/" && next === "*") {
      state = "blockComment";
      index += 2;
      continue;
    }
    if (state === "code" && ["\"", "'", "`"].includes(current)) {
      state = "string";
      quote = current;
      index++;
      continue;
    }
    if (state === "lineComment" && (current === "\n" || current === "\r")) {
      state = "code";
      index++;
      continue;
    }
    if (state === "blockComment" && current === "*" && next === "/") {
      state = "code";
      index += 2;
      continue;
    }
    if (state === "string" && current === "\\") {
      index += 2;
      continue;
    }
    if (state === "string" && current === quote) {
      state = "code";
      quote = "";
      index++;
      continue;
    }

    wordPattern.lastIndex = index;
    const match = wordPattern.exec(code);
    if (match?.index === index) {
      const text = match[0];
      const kind = state === "lineComment" || state === "blockComment"
        ? "comment"
        : state === "string"
          ? "string"
          : commonKeywords.has(text)
            ? "keyword"
            : "identifier";
      const enabled = kind === "identifier"
        || (kind === "keyword" && options.includeKeywords === true)
        || (kind === "comment" && options.includeComments)
        || (kind === "string" && options.includeStrings);
      if (enabled) words.push({ text, start: index, end: index + text.length, kind });
      index += text.length;
      continue;
    }
    index++;
  }
  return words;
}

export function getBoldOffsets(
  code: string,
  boldOptions: BoldOptions,
  scanOptions: { includeComments: boolean; includeStrings: boolean; includeKeywords?: boolean },
): OffsetRange[] {
  return scanCodeWords(code, scanOptions).flatMap((word) =>
    calculateBoldRanges(word.text, boldOptions).map((range) => ({
      start: word.start + range.start,
      end: word.start + range.end,
    })),
  );
}

export function buildTokenSegments(code: string, boldOptions: BoldOptions): TokenSegment[] {
  const words = scanCodeWords(code, {
    includeComments: true,
    includeStrings: false,
    includeKeywords: true,
  });
  const segments: TokenSegment[] = [];
  let cursor = 0;
  words.forEach((word, wordIndex) => {
    if (word.start > cursor) {
      segments.push({ id: `p-${cursor}`, text: code.slice(cursor, word.start), kind: "plain", boldRanges: [] });
    }
    segments.push({
      id: `w-${wordIndex}-${word.start}`,
      text: word.text,
      kind: "word",
      boldRanges: calculateBoldRanges(word.text, boldOptions),
    });
    cursor = word.end;
  });
  if (cursor < code.length) {
    segments.push({ id: `p-${cursor}`, text: code.slice(cursor), kind: "plain", boldRanges: [] });
  }
  return segments;
}
