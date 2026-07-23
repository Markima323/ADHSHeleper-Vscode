import type { TokenSegment } from "./types.js";
import { splitIdentifier } from "./identifier.js";

const germanTerms: Record<string, string> = {
  function: "Funktion", return: "gibt zurück", if: "wenn", else: "sonst",
  for: "für Schleife", while: "solange Schleife", class: "Klasse", const: "Konstante",
  let: "Variable", true: "wahr", false: "falsch",
};

export function buildGermanNarration(segments: TokenSegment[]): string {
  return segments
    .filter((segment) => segment.kind === "word")
    .map((segment) => germanTerms[segment.text] ?? segment.text.replaceAll("_", " "))
    .join(", ");
}

const englishTerms: Record<string, string> = {
  function: "function", return: "return", if: "if", else: "else",
  for: "for loop", while: "while loop", class: "class", const: "constant",
  let: "variable", true: "true", false: "false",
};

/** Builds a concise English reading plan from learnable code words. */
export function buildEnglishNarration(segments: TokenSegment[]): string {
  return segments
    .filter((segment) => segment.kind === "word")
    .flatMap((segment) => {
      const mapped = englishTerms[segment.text];
      if (mapped) return [mapped];
      const parts = splitIdentifier(segment.text).map((range) => segment.text.slice(range.start, range.end));
      return parts.length > 0 ? parts : [segment.text];
    })
    .join(", ");
}
