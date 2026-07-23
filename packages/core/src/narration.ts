import type { TokenSegment } from "./types.js";

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
