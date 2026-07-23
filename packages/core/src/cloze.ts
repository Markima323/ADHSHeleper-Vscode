import type { BlankToken, ChoiceToken, ClozeQuizModel, TokenSegment } from "./types.js";

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFromSeed(seed: string): () => number {
  let state = hashSeed(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

export function createClozeQuiz(
  segments: TokenSegment[],
  maxBlankCount: number,
  seed: string,
): ClozeQuizModel {
  const random = randomFromSeed(seed);
  const candidates = segments
    .map((segment, segmentIndex) => ({ segment, segmentIndex }))
    .filter(({ segment }) => segment.kind === "word" && segment.text.length >= 3);
  const selected = shuffle(candidates, random)
    .slice(0, Math.max(0, maxBlankCount))
    .sort((a, b) => a.segmentIndex - b.segmentIndex);

  const blanks: BlankToken[] = selected.map(({ segment, segmentIndex }, index) => ({
    id: `blank-${index}-${segment.id}`,
    answerChoiceId: `choice-${index}-${segment.id}`,
    text: segment.text,
    segmentIndex,
  }));
  const choices: ChoiceToken[] = blanks.map((blank) => {
    const syntaxKind = segments[blank.segmentIndex]?.syntaxKind;
    return {
      id: blank.answerChoiceId,
      text: blank.text,
      ...(syntaxKind ? { syntaxKind } : {}),
    };
  });
  return { seed, blanks, choices: shuffle(choices, random), maxBlankCount };
}
