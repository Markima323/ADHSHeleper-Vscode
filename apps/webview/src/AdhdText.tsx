import type { OffsetRange, TokenSegment } from "@adhd-code-focus/core";

type Props = {
  segments: TokenSegment[];
  blankBySegment: Map<number, { text: string; filled: boolean; current: boolean }>;
};

export function AdhdText({ segments, blankBySegment }: Props) {
  return <code className="code-content">{segments.map((segment, index) => {
    const blank = blankBySegment.get(index);
    if (blank) {
      return <span
        key={segment.id}
        className={`blank ${blank.filled ? "filled" : ""} ${blank.current ? "current" : ""}`}
        aria-label={`代码空位${blank.current ? "，当前待填写" : ""}`}
      >{blank.filled ? renderBoldText(blank.text, segment.boldRanges) : " "}</span>;
    }
    return <span key={segment.id}>{renderBoldText(segment.text, segment.boldRanges)}</span>;
  })}</code>;
}

function renderBoldText(text: string, ranges: OffsetRange[]) {
  if (ranges.length === 0) return text;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) nodes.push(text.slice(cursor, range.start));
    nodes.push(<strong key={`${range.start}-${index}`}>{text.slice(range.start, range.end)}</strong>);
    cursor = range.end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}
