import * as vscode from "vscode";
import { getBoldOffsets } from "@adhd-code-focus/core";

type FocusConfig = {
  enabled: boolean;
  boldRatio: number;
  minTokenLength: number;
  maxBoldChars: number;
  includeComments: boolean;
  includeStrings: boolean;
  visibleRangeOnly: boolean;
};

export class DecorationEngine implements vscode.Disposable {
  private readonly decoration = vscode.window.createTextEditorDecorationType({ fontWeight: "700" });
  private readonly disabledEditors = new Set<string>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  isEnabled(editor: vscode.TextEditor): boolean {
    return this.readConfig().enabled && !this.disabledEditors.has(editor.document.uri.toString());
  }

  toggle(editor: vscode.TextEditor): boolean {
    const key = editor.document.uri.toString();
    if (this.isEnabled(editor)) this.disabledEditors.add(key);
    else this.disabledEditors.delete(key);
    this.refresh(editor);
    return this.isEnabled(editor);
  }

  schedule(editor: vscode.TextEditor, delay = 100): void {
    const key = editor.document.uri.toString();
    const previous = this.timers.get(key);
    if (previous) clearTimeout(previous);
    this.timers.set(key, setTimeout(() => {
      this.timers.delete(key);
      this.refresh(editor);
    }, delay));
  }

  refresh(editor: vscode.TextEditor): void {
    if (!this.isEnabled(editor) || editor.document.lineCount > 100_000) {
      editor.setDecorations(this.decoration, []);
      return;
    }
    const config = this.readConfig();
    const sourceRanges = config.visibleRangeOnly
      ? editor.visibleRanges.map((visible) => new vscode.Range(
          Math.max(0, visible.start.line - 2), 0,
          Math.min(editor.document.lineCount - 1, visible.end.line + 2),
          editor.document.lineAt(Math.min(editor.document.lineCount - 1, visible.end.line + 2)).text.length,
        ))
      : [new vscode.Range(0, 0, editor.document.lineCount - 1, editor.document.lineAt(editor.document.lineCount - 1).text.length)];

    const ranges: vscode.Range[] = [];
    for (const sourceRange of sourceRanges) {
      const baseOffset = editor.document.offsetAt(sourceRange.start);
      const source = editor.document.getText(sourceRange);
      const offsets = getBoldOffsets(source, config, {
        includeComments: config.includeComments,
        includeStrings: config.includeStrings,
      });
      for (const offset of offsets) {
        ranges.push(new vscode.Range(
          editor.document.positionAt(baseOffset + offset.start),
          editor.document.positionAt(baseOffset + offset.end),
        ));
      }
    }
    editor.setDecorations(this.decoration, ranges);
  }

  clear(editor: vscode.TextEditor): void {
    editor.setDecorations(this.decoration, []);
  }

  private readConfig(): FocusConfig {
    const config = vscode.workspace.getConfiguration("adhdCodeFocus");
    return {
      enabled: config.get("enabled", true),
      boldRatio: config.get("boldRatio", 0.42),
      minTokenLength: config.get("minTokenLength", 3),
      maxBoldChars: config.get("maxBoldChars", 6),
      includeComments: config.get("includeComments", true),
      includeStrings: config.get("includeStrings", false),
      visibleRangeOnly: config.get("visibleRangeOnly", true),
    };
  }

  dispose(): void {
    this.timers.forEach(clearTimeout);
    this.decoration.dispose();
  }
}
