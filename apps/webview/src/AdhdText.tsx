import type { OffsetRange, SyntaxKind, TokenSegment } from "@adhd-code-focus/core";

type Props = {
  segments: TokenSegment[];
  blankBySegment: Map<number, { text: string; filled: boolean; current: boolean }>;
  onExplainLine?: (lineIndex: number, code: string) => void;
};

type Fragment = { segment: TokenSegment; segmentIndex: number; text: string; start: number };

export function AdhdText({ segments, blankBySegment, onExplainLine }: Props) {
  const lines = splitTokenSegmentsIntoLines(segments);
  return <code className="code-content">{lines.map((line, lineIndex) => {
    const lineCode = line.map((fragment) => fragment.text).join("");
    return <span className="code-line" key={lineIndex}>
      <button
        type="button"
        className="line-explain-dot"
        aria-label={`使用 Gemini 解释第 ${lineIndex + 1} 行`}
        title="解释这一行"
        onClick={() => onExplainLine?.(lineIndex, lineCode)}
      ><span aria-hidden="true" /></button>
      <span className="line-code">{line.map((fragment, fragmentIndex) => {
        const { segment, segmentIndex, text, start } = fragment;
        const blank = blankBySegment.get(segmentIndex);
        const boldRanges = sliceRanges(segment.boldRanges, start, text.length);
    if (blank) {
      return <span
            key={`${segment.id}-${fragmentIndex}`}
        className={`blank ${syntaxClass(segment.syntaxKind)} ${blank.filled ? "filled" : ""} ${blank.current ? "current" : ""}`}
        aria-label={`代码空位${blank.current ? "，当前待填写" : ""}`}
          >{blank.filled ? renderBoldText(blank.text, boldRanges) : " "}</span>;
    }
        return <span key={`${segment.id}-${fragmentIndex}`} className={syntaxClass(segment.syntaxKind)}>
          {renderBoldText(text, boldRanges)}
        </span>;
      })}</span>
    </span>;
  })}</code>;
}

export function splitTokenSegmentsIntoLines(segments: TokenSegment[]): Fragment[][] {
  const lines: Fragment[][] = [[]];
  segments.forEach((segment, segmentIndex) => {
    let start = 0;
    for (let index = 0; index < segment.text.length; index++) {
      if (segment.text[index] !== "\n") continue;
      if (index > start) lines[lines.length - 1]!.push({
        segment, segmentIndex, text: segment.text.slice(start, index), start,
      });
      lines.push([]);
      start = index + 1;
    }
    if (start < segment.text.length) lines[lines.length - 1]!.push({
      segment, segmentIndex, text: segment.text.slice(start), start,
    });
  });
  return lines;
}

function sliceRanges(ranges: OffsetRange[], fragmentStart: number, fragmentLength: number): OffsetRange[] {
  const fragmentEnd = fragmentStart + fragmentLength;
  return ranges.flatMap((range) => {
    const start = Math.max(range.start, fragmentStart);
    const end = Math.min(range.end, fragmentEnd);
    return start < end ? [{ start: start - fragmentStart, end: end - fragmentStart }] : [];
  });
}

function syntaxClass(kind: SyntaxKind | undefined): string {
  return kind && kind !== "plain" ? `syntax-${kind}` : "";
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
