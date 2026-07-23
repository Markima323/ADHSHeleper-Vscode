import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { LearningSessionDto } from "@adhd-code-focus/core";

const defaultStorageDirectory = resolve("D:\\codeLearn");
const explanationPromptVersion = 2;
const cardFormatVersion = 2;

type StoredExplanation = {
  text: string;
  model: string;
  updatedAt: string;
  promptVersion: number;
};

type StoredSession = {
  sourceHash: string;
  cardFormatVersion: number;
  updatedAt: string;
  session: LearningSessionDto;
  explanations: Record<string, StoredExplanation>;
  lineExplanations?: Record<string, StoredExplanation>;
};

type RecordFile = {
  version: 1;
  sourceUriHash: string;
  sessions: StoredSession[];
};

export type OpenedLearningRecord = {
  session: LearningSessionDto;
  explanations: Record<string, string>;
  lineExplanations: Record<string, string>;
  saveExplanation(chunkId: string, text: string, model: string): Promise<void>;
  saveLineExplanation(lineKey: string, text: string, model: string): Promise<void>;
};

export class LearningRecordStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly storageDirectory = defaultStorageDirectory) {}

  async open(
    sourceUri: string,
    sourceCode: string,
    freshSession: LearningSessionDto,
  ): Promise<OpenedLearningRecord> {
    await mkdir(this.storageDirectory, { recursive: true });
    const sourceUriHash = hash(sourceUri);
    const sourceHash = hash(sourceCode);
    const filePath = join(this.storageDirectory, `${sourceUriHash}.json`);
    const record = await readRecord(filePath, sourceUriHash);
    let stored = record.sessions.find((item) =>
      item.sourceHash === sourceHash && item.cardFormatVersion === cardFormatVersion,
    );

    if (!stored) {
      const previous = record.sessions.find((item) => item.sourceHash === sourceHash);
      const migratedExplanations = migrateExplanations(previous, freshSession);
      stored = {
        sourceHash,
        cardFormatVersion,
        updatedAt: new Date().toISOString(),
        session: freshSession,
        explanations: migratedExplanations,
        lineExplanations: {},
      };
      record.sessions.push(stored);
      await writeRecord(filePath, record);
    }

    const restoredSession: LearningSessionDto = {
      ...stored.session,
      id: freshSession.id,
      createdAt: freshSession.createdAt,
      settings: freshSession.settings,
    };
    const explanations = Object.fromEntries(
      Object.entries(stored.explanations)
        .filter(([, value]) => value.promptVersion === explanationPromptVersion)
        .map(([chunkId, value]) => [chunkId, value.text]),
    );
    const lineExplanations = currentExplanationTexts(stored.lineExplanations ?? {});
    return {
      session: restoredSession,
      explanations,
      lineExplanations,
      saveExplanation: (chunkId, text, model) => this.enqueueSave(
        filePath, sourceUriHash, sourceHash, "chunk", chunkId, text, model,
      ),
      saveLineExplanation: (lineKey, text, model) => this.enqueueSave(
        filePath, sourceUriHash, sourceHash, "line", lineKey, text, model,
      ),
    };
  }

  private enqueueSave(
    filePath: string,
    sourceUriHash: string,
    sourceHash: string,
    target: "chunk" | "line",
    recordKey: string,
    text: string,
    model: string,
  ): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      const record = await readRecord(filePath, sourceUriHash);
      const stored = record.sessions.find((item) =>
        item.sourceHash === sourceHash && item.cardFormatVersion === cardFormatVersion,
      );
      if (!stored) throw new Error("找不到对应的本地学习会话记录。");
      const chunkId = target === "line" ? recordKey.split(":line:")[0] : recordKey;
      if (!stored.session.chunks.some((chunk) => chunk.id === chunkId)) {
        throw new Error("本地学习记录中不存在这个代码卡片。");
      }
      const destination = target === "chunk"
        ? stored.explanations
        : (stored.lineExplanations ??= {});
      destination[recordKey] = {
        text,
        model,
        updatedAt: new Date().toISOString(),
        promptVersion: explanationPromptVersion,
      };
      stored.updatedAt = new Date().toISOString();
      await writeRecord(filePath, record);
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }
}

export function getLearningRecordDirectory(): string {
  return defaultStorageDirectory;
}

async function readRecord(filePath: string, sourceUriHash: string): Promise<RecordFile> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
    if (!isRecordFile(parsed, sourceUriHash)) {
      throw new Error("本地学习记录格式无效或版本不受支持。");
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, sourceUriHash, sessions: [] };
    }
    throw error;
  }
}

async function writeRecord(filePath: string, record: RecordFile): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

function isRecordFile(value: unknown, expectedHash: string): value is RecordFile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RecordFile>;
  return candidate.version === 1
    && candidate.sourceUriHash === expectedHash
    && Array.isArray(candidate.sessions);
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function migrateExplanations(
  previous: StoredSession | undefined,
  freshSession: LearningSessionDto,
): Record<string, StoredExplanation> {
  if (!previous) return {};
  return Object.fromEntries(freshSession.chunks.flatMap((freshChunk) => {
    const previousChunk = previous.session.chunks.find((chunk) => chunk.code === freshChunk.code);
    const explanation = previousChunk ? previous.explanations[previousChunk.id] : undefined;
    return explanation?.promptVersion === explanationPromptVersion
      ? [[freshChunk.id, explanation] as const]
      : [];
  }));
}

function currentExplanationTexts(
  explanations: Record<string, StoredExplanation>,
): Record<string, string> {
  return Object.fromEntries(Object.entries(explanations)
    .filter(([, value]) => value.promptVersion === explanationPromptVersion)
    .map(([key, value]) => [key, value.text]));
}
