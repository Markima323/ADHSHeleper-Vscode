import { calculateBoldRanges, type BoldOptions } from "./identifier.js";
import type { OffsetRange, SyntaxKind, TokenSegment } from "./types.js";

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
  const segments: TokenSegment[] = [];
  let index = 0;
  while (index < code.length) {
    const current = code[index] ?? "";
    const next = code[index + 1] ?? "";
    if (current === "/" && next === "/") {
      const end = findLineEnd(code, index);
      pushDisplaySegment(segments, code.slice(index, end), index, "plain", "comment", boldInNaturalText(code.slice(index, end), boldOptions));
      index = end;
      continue;
    }
    if (current === "/" && next === "*") {
      const closing = code.indexOf("*/", index + 2);
      const end = closing < 0 ? code.length : closing + 2;
      pushDisplaySegment(segments, code.slice(index, end), index, "plain", "comment", boldInNaturalText(code.slice(index, end), boldOptions));
      index = end;
      continue;
    }
    if (["\"", "'", "`"].includes(current)) {
      const end = findStringEnd(code, index, current);
      pushDisplaySegment(segments, code.slice(index, end), index, "plain", "string", []);
      index = end;
      continue;
    }
    const number = code.slice(index).match(/^(?:0[xob][\da-f]+|\d+(?:\.\d+)?)/iu)?.[0];
    if (number) {
      pushDisplaySegment(segments, number, index, "plain", "number", []);
      index += number.length;
      continue;
    }
    wordPattern.lastIndex = index;
    const word = wordPattern.exec(code);
    if (word?.index === index) {
      const text = word[0];
      const syntaxKind = commonKeywords.has(text) ? "keyword" : classifyIdentifier(code, index, index + text.length, text);
      pushDisplaySegment(segments, text, index, "word", syntaxKind, calculateBoldRanges(text, boldOptions));
      index += text.length;
      continue;
    }
    const whitespace = code.slice(index).match(/^\s+/u)?.[0];
    if (whitespace) {
      pushDisplaySegment(segments, whitespace, index, "plain", "plain", []);
      index += whitespace.length;
      continue;
    }
    const operator = code.slice(index).match(/^(?:=>|===|!==|==|!=|<=|>=|\+\+|--|&&|\|\||\?\?|\+=|-=|\*=|\/=|[+\-*/%=<>!&|?:~^]+)/u)?.[0];
    if (operator) {
      pushDisplaySegment(segments, operator, index, "plain", "operator", []);
      index += operator.length;
      continue;
    }
    pushDisplaySegment(segments, current, index, "plain", "plain", []);
    index++;
  }
  return segments;
}

function pushDisplaySegment(
  segments: TokenSegment[],
  text: string,
  offset: number,
  kind: TokenSegment["kind"],
  syntaxKind: SyntaxKind,
  boldRanges: OffsetRange[],
): void {
  segments.push({ id: `${kind === "word" ? "w" : "p"}-${offset}`, text, kind, boldRanges, syntaxKind });
}

function classifyIdentifier(code: string, start: number, end: number, text: string): SyntaxKind {
  const before = code.slice(0, start).trimEnd().slice(-1);
  const after = code.slice(end).trimStart()[0] ?? "";
  if (after === "(") return before === "." ? "method" : "function";
  if (/^\p{Lu}/u.test(text)) return "type";
  if (before === ".") return "property";
  return "identifier";
}

function findLineEnd(code: string, start: number): number {
  const end = code.indexOf("\n", start);
  return end < 0 ? code.length : end;
}

function findStringEnd(code: string, start: number, quote: string): number {
  let index = start + 1;
  while (index < code.length) {
    if (code[index] === "\\") {
      index += 2;
      continue;
    }
    if (code[index] === quote) return index + 1;
    index++;
  }
  return code.length;
}

function boldInNaturalText(text: string, options: BoldOptions): OffsetRange[] {
  return [...text.matchAll(/[$_\p{L}][$_\p{L}\p{N}]*/gu)].flatMap((match) =>
    calculateBoldRanges(match[0], options).map((range) => ({
      start: match.index + range.start,
      end: match.index + range.end,
    })),
  );
}
