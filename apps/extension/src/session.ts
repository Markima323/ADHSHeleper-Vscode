import * as vscode from "vscode";
import {
  buildEnglishNarration,
  buildTokenSegments,
  chunkByLines,
  createClozeQuiz,
  type LearningSessionDto,
} from "@adhd-code-focus/core";

export type LearningSource = { range: vscode.Range; code: string };

export function buildLearningSession(
  document: vscode.TextDocument,
  source: LearningSource,
): LearningSessionDto {
  const config = vscode.workspace.getConfiguration("adhdCodeFocus");
  const boldOptions = {
    boldRatio: config.get("boldRatio", 0.42),
    minTokenLength: config.get("minTokenLength", 3),
    maxBoldChars: config.get("maxBoldChars", 6),
  };
  const maxLines = config.get("learning.maxChunkLines", 12);
  const maxBlankCount = config.get("learning.blankCount", 6);
  const id = `${Date.now()}-${document.version}`;
  const chunks = chunkByLines(source.code, source.range.start.line, maxLines).map((chunk, index) => {
    const tokenSegments = buildTokenSegments(chunk.code, boldOptions);
    return {
      id: `${id}-chunk-${index}`,
      title: chunk.title,
      languageId: document.languageId,
      sourceUri: document.uri.toString(),
      sourceRange: {
        startLine: chunk.startLine,
        startCharacter: chunk.startLine === source.range.start.line ? source.range.start.character : 0,
        endLine: chunk.endLine,
        endCharacter: chunk.endLine === source.range.end.line
          ? source.range.end.character
          : document.lineAt(Math.min(chunk.endLine, document.lineCount - 1)).text.length,
      },
      code: chunk.code,
      tokenSegments,
      quiz: createClozeQuiz(tokenSegments, maxBlankCount, `${id}-${index}`),
      narrationText: buildEnglishNarration(tokenSegments),
    };
  });
  return {
    id,
    createdAt: new Date().toISOString(),
    chunks,
    settings: {
      boldRatio: boldOptions.boldRatio,
      ttsLocale: config.get("tts.locale", "en-US"),
      ttsRate: config.get("tts.rate", 0.9),
      ttsAutoPlay: config.get("tts.autoPlay", true),
    },
  };
}

export async function sourceForCurrentSymbol(editor: vscode.TextEditor): Promise<LearningSource> {
  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    "vscode.executeDocumentSymbolProvider",
    editor.document.uri,
  );
  const cursor = editor.selection.active;
  const flattened = flattenSymbols(symbols ?? []).filter((symbol) => symbol.range.contains(cursor));
  const symbol = flattened.sort((a, b) => rangeSize(a.range) - rangeSize(b.range))[0];
  const range = symbol?.range ?? fullDocumentRange(editor.document);
  return { range, code: editor.document.getText(range) };
}

export function sourceForSelectionOrDocument(editor: vscode.TextEditor): LearningSource {
  const range = editor.selection.isEmpty ? fullDocumentRange(editor.document) : editor.selection;
  return { range, code: editor.document.getText(range) };
}

export function sourceFromLineToDocumentEnd(editor: vscode.TextEditor, line = editor.selection.active.line): LearningSource {
  const document = editor.document;
  const startLine = Math.max(0, Math.min(line, document.lineCount - 1));
  const lastLine = document.lineCount - 1;
  const range = new vscode.Range(
    startLine,
    0,
    lastLine,
    document.lineAt(lastLine).text.length,
  );
  return { range, code: document.getText(range) };
}

function fullDocumentRange(document: vscode.TextDocument): vscode.Range {
  const lastLine = document.lineCount - 1;
  return new vscode.Range(0, 0, lastLine, document.lineAt(lastLine).text.length);
}

function flattenSymbols(symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
  return symbols.flatMap((symbol) => [symbol, ...flattenSymbols(symbol.children)]);
}

function rangeSize(range: vscode.Range): number {
  return (range.end.line - range.start.line) * 100_000 + range.end.character - range.start.character;
}
