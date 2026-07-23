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
  provider?: "gemini" | "deepseek";
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
  getExplanation(chunkId: string, provider: string, model: string): string | undefined;
  getLineExplanation(lineKey: string, provider: string, model: string): string | undefined;
  saveExplanation(chunkId: string, text: string, provider: string, model: string): Promise<void>;
  saveLineExplanation(lineKey: string, text: string, provider: string, model: string): Promise<void>;
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
    return {
      session: restoredSession,
      getExplanation: (chunkId, provider, model) => findExplanation(stored!.explanations, chunkId, provider, model),
      getLineExplanation: (lineKey, provider, model) => findExplanation(stored!.lineExplanations ?? {}, lineKey, provider, model),
      saveExplanation: (chunkId, text, provider, model) => this.enqueueSave(
        filePath, sourceUriHash, sourceHash, "chunk", chunkId, text, provider, model,
      ),
      saveLineExplanation: (lineKey, text, provider, model) => this.enqueueSave(
        filePath, sourceUriHash, sourceHash, "line", lineKey, text, provider, model,
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
    provider: string,
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
      destination[providerRecordKey(recordKey, provider, model)] = {
        text,
        model,
        provider: provider === "deepseek" ? "deepseek" : "gemini",
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

function providerRecordKey(baseKey: string, provider: string, model: string): string {
  return `${baseKey}:ai:${provider}:${model}`;
}

function findExplanation(
  explanations: Record<string, StoredExplanation>,
  baseKey: string,
  provider: string,
  model: string,
): string | undefined {
  const exact = explanations[providerRecordKey(baseKey, provider, model)];
  if (exact?.promptVersion === explanationPromptVersion) return exact.text;
  const legacy = explanations[baseKey];
  if (provider === "gemini"
    && legacy?.promptVersion === explanationPromptVersion
    && (legacy.provider ?? "gemini") === "gemini"
    && legacy.model === model) return legacy.text;
  return undefined;
}
