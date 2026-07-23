import { calculateBoldRanges, type OffsetRange } from "@adhd-code-focus/core";

type Props = { text: string; boldRatio: number };

export function AdhdExplanation({ text, boldRatio }: Props) {
  const units = segmentText(text);
  return <p className="explanation-text">{units.map((unit, index) => {
    if (!unit.isWordLike) return <span key={index}>{unit.text}</span>;
    const ranges = calculateBoldRanges(unit.text, {
      boldRatio,
      minTokenLength: 2,
      maxBoldChars: 6,
    });
    return <span key={index}>{renderBoldText(unit.text, ranges, index)}</span>;
  })}</p>;
}

type TextUnit = { text: string; isWordLike: boolean };

function segmentText(text: string): TextUnit[] {
  if (typeof Intl.Segmenter === "function") {
    return [...new Intl.Segmenter("zh-CN", { granularity: "word" }).segment(text)].map((part) => ({
      text: part.segment,
      isWordLike: part.isWordLike === true,
    }));
  }
  return text.split(/([$_\p{L}][$_\p{L}\p{N}]*)/gu)
    .filter(Boolean)
    .map((part) => ({ text: part, isWordLike: /[$_\p{L}]/u.test(part[0] ?? "") }));
}

function renderBoldText(text: string, ranges: OffsetRange[], keyPrefix: number) {
  if (ranges.length === 0) return text;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) nodes.push(text.slice(cursor, range.start));
    nodes.push(<strong key={`${keyPrefix}-${index}`}>{text.slice(range.start, range.end)}</strong>);
    cursor = range.end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}
