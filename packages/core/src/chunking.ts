export type TextChunk = {
  code: string;
  startLine: number;
  endLine: number;
  title: string;
};

/** Fallback chunker that prefers blank-line boundaries and caps every card. */
export function chunkByLines(code: string, firstLine: number, maxLines = 24): TextChunk[] {
  const lines = code.split(/\r?\n/);
  const chunks: TextChunk[] = [];
  let start = 0;
  while (start < lines.length) {
    let end = Math.min(start + maxLines, lines.length);
    if (end < lines.length) {
      for (let candidate = end; candidate > start + Math.floor(maxLines / 2); candidate--) {
        if ((lines[candidate - 1] ?? "").trim() === "") {
          end = candidate;
          break;
        }
      }
    }
    const slice = lines.slice(start, end);
    if (slice.some((line) => line.trim().length > 0)) {
      chunks.push({
        code: slice.join("\n"),
        startLine: firstLine + start,
        endLine: firstLine + end - 1,
        title: `第 ${chunks.length + 1} 段 · 第 ${firstLine + start + 1}–${firstLine + end} 行`,
      });
    }
    start = end;
  }
  return chunks;
}
