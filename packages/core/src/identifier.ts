import type { OffsetRange } from "./types.js";

export type BoldOptions = {
  boldRatio: number;
  minTokenLength: number;
  maxBoldChars: number;
  minBoldChars?: number;
};

const graphemes = (text: string): string[] => {
  if (typeof Intl.Segmenter === "function") {
    return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map(
      (part) => part.segment,
    );
  }
  return Array.from(text);
};

/** Splits identifiers while retaining UTF-16 offsets in the original string. */
export function splitIdentifier(value: string): OffsetRange[] {
  const matches = value.matchAll(
    /\p{Lu}+(?=\p{Lu}\p{Ll}|\p{Nd}|\b)|\p{Lu}?\p{Ll}+|\p{Lu}+|\p{Lo}+|\p{Nd}+/gu,
  );
  return [...matches].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

export function calculateBoldRanges(value: string, options: BoldOptions): OffsetRange[] {
  const minimum = options.minBoldChars ?? 1;
  return splitIdentifier(value).flatMap((part) => {
    const subword = value.slice(part.start, part.end);
    const clusters = graphemes(subword);
    if (clusters.length < options.minTokenLength) return [];

    const boldCount = Math.min(
      options.maxBoldChars,
      Math.max(minimum, Math.ceil(clusters.length * options.boldRatio)),
    );
    const utf16Length = clusters.slice(0, boldCount).join("").length;
    return [{ start: part.start, end: part.start + utf16Length }];
  });
}
