import { useEffect, useMemo, useRef, useState } from "react";
import type { LearningSessionDto } from "@adhd-code-focus/core";
import { AdhdText } from "./AdhdText";
import { AdhdExplanation } from "./AdhdExplanation";
import { DraggableLineExplanation, type LineExplanationState } from "./DraggableLineExplanation";
import { chooseAnswer, initialQuizState, undoAnswer, type QuizState } from "./quizState";
import { vscode } from "./vscode";

type ExplanationState =
  | { status: "loading" }
  | { status: "needs-key" }
  | { status: "ready"; text: string; source: "local" | "api" }
  | { status: "error"; message: string };

export function App() {
  const [session, setSession] = useState<LearningSessionDto | null>(null);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [quizState, setQuizState] = useState<QuizState>(initialQuizState);
  const [speaking, setSpeaking] = useState(false);
  const [explanations, setExplanations] = useState<Record<string, ExplanationState>>({});
  const [aiRevision, setAiRevision] = useState(0);
  const [aiProvider, setAiProvider] = useState({ provider: "gemini", label: "Gemini", model: "" });
  const [lineExplanation, setLineExplanation] = useState<LineExplanationState | null>(null);
  const startedAt = useRef(Date.now());
  const completionSent = useRef(false);
  const autoPlayedChunk = useRef<string | null>(null);
  const cachedExplanationIds = useRef(new Set<string>());
  const pendingLineRequest = useRef<{ chunkId: string; lineIndex: number } | null>(null);
  const aiProviderRef = useRef("gemini");

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.data?.type === "session/init") {
        const payload = event.data.payload as {
          session: LearningSessionDto;
          ai: { provider: string; label: string; model: string };
        };
        cachedExplanationIds.current.clear();
        setExplanations({});
        aiProviderRef.current = payload.ai.provider;
        setAiProvider(payload.ai);
        setSession(payload.session);
      } else if (event.data?.type === "ai/explanation") {
        const payload = event.data.payload as {
          chunkId: string;
          status: ExplanationState["status"];
          text?: string;
          message?: string;
          provider?: string;
        };
        if (payload.provider && payload.provider !== aiProviderRef.current) return;
        const state: ExplanationState = payload.status === "ready"
          ? { status: "ready", text: payload.text ?? "", source: event.data.payload.source ?? "api" }
          : payload.status === "error"
            ? { status: "error", message: payload.message ?? "解释生成失败。" }
            : payload.status === "needs-key"
              ? { status: "needs-key" }
              : { status: "loading" };
        if (state.status === "ready") cachedExplanationIds.current.add(payload.chunkId);
        setExplanations((current) => ({ ...current, [payload.chunkId]: state }));
      } else if (event.data?.type === "ai/configured") {
        setAiRevision((value) => value + 1);
        if (pendingLineRequest.current) {
          vscode.postMessage({ type: "ai/explain-line", payload: pendingLineRequest.current });
        }
      } else if (event.data?.type === "ai/line-explanation") {
        const payload = event.data.payload as {
          chunkId: string;
          lineIndex: number;
          status: LineExplanationState["status"];
          text?: string;
          message?: string;
          source?: "local" | "api";
          provider?: string;
        };
        if (payload.provider && payload.provider !== aiProviderRef.current) return;
        setLineExplanation((current) => {
          if (!current || current.chunkId !== payload.chunkId || current.lineIndex !== payload.lineIndex) return current;
          return {
            ...current,
            status: payload.status,
            ...(payload.text !== undefined ? { text: payload.text } : {}),
            ...(payload.message !== undefined ? { message: payload.message } : {}),
            ...(payload.source !== undefined ? { source: payload.source } : {}),
          };
        });
      } else if (event.data?.type === "ai/provider-update") {
        cachedExplanationIds.current.clear();
        pendingLineRequest.current = null;
        setLineExplanation(null);
        setExplanations({});
        aiProviderRef.current = event.data.payload.provider;
        setAiProvider(event.data.payload);
        setAiRevision((value) => value + 1);
      } else if (event.data?.type === "settings/update") {
        const ttsAutoPlay = event.data.payload?.ttsAutoPlay === true;
        if (!ttsAutoPlay) {
          window.speechSynthesis?.cancel();
          setSpeaking(false);
        }
        setSession((current) => current ? {
          ...current,
          settings: { ...current.settings, ttsAutoPlay },
        } : current);
      }
    };
    window.addEventListener("message", listener);
    vscode.postMessage({ type: "ready" });
    return () => window.removeEventListener("message", listener);
  }, []);

  const chunk = session?.chunks[chunkIndex];
  const blankBySegment = useMemo(() => {
    const result = new Map<number, { text: string; filled: boolean; current: boolean }>();
    chunk?.quiz.blanks.forEach((blank, index) => result.set(blank.segmentIndex, {
      text: blank.text,
      filled: index < quizState.answers.length,
      current: index === quizState.answers.length,
    }));
    return result;
  }, [chunk, quizState.answers.length]);

  const speak = () => {
    if (!session || !chunk) return;
    if (!("speechSynthesis" in window)) {
      vscode.postMessage({ type: "tts/unavailable", payload: { locale: session.settings.ttsLocale } });
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(chunk.narrationText);
    utterance.lang = session.settings.ttsLocale;
    utterance.rate = session.settings.ttsRate;
    const voices = window.speechSynthesis.getVoices();
    const language = session.settings.ttsLocale.split("-")[0]?.toLowerCase() ?? "en";
    const voice = voices.find((item) => item.lang.toLowerCase().startsWith(language));
    if (voices.length > 0 && !voice) {
      vscode.postMessage({ type: "tts/unavailable", payload: { locale: session.settings.ttsLocale } });
      return;
    }
    if (voice) utterance.voice = voice;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (!session || !chunk || !session.settings.ttsAutoPlay || autoPlayedChunk.current === chunk.id) return;
    autoPlayedChunk.current = chunk.id;
    const timer = window.setTimeout(speak, 180);
    return () => {
      window.clearTimeout(timer);
      window.speechSynthesis?.cancel();
    };
  }, [session, chunk]);

  useEffect(() => {
    if (!chunk) return;
    if (cachedExplanationIds.current.has(chunk.id)) return;
    setExplanations((current) => ({ ...current, [chunk.id]: { status: "loading" } }));
    vscode.postMessage({ type: "ai/explain", payload: { chunkId: chunk.id } });
  }, [chunk?.id, aiRevision]);

  if (!session || !chunk) return <main className="loading" aria-live="polite">正在准备学习卡片…</main>;

  const moveTo = (next: number) => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setChunkIndex(next);
    setQuizState(initialQuizState());
    setLineExplanation(null);
    pendingLineRequest.current = null;
  };
  const onChoice = (choiceId: string) => {
    const next = chooseAnswer(quizState, choiceId, chunk.quiz);
    setQuizState(next);
    if (next.completed && chunkIndex === session.chunks.length - 1 && !completionSent.current) {
      completionSent.current = true;
      vscode.postMessage({
        type: "session/complete",
        payload: { score: 1, durationMs: Date.now() - startedAt.current },
      });
    }
  };
  const used = new Set(quizState.answers);
  const explanation = explanations[chunk.id] ?? { status: "loading" };
  const retryExplanation = () => {
    setExplanations((current) => ({ ...current, [chunk.id]: { status: "loading" } }));
    vscode.postMessage({ type: "ai/explain", payload: { chunkId: chunk.id } });
  };
  const explainLine = (lineIndex: number, code: string) => {
    const request = { chunkId: chunk.id, lineIndex };
    pendingLineRequest.current = request;
    setLineExplanation({
      ...request,
      displayLine: chunk.sourceRange.startLine + lineIndex + 1,
      code,
      status: "loading",
    });
    vscode.postMessage({ type: "ai/explain-line", payload: request });
  };
  const retryLineExplanation = () => {
    if (!lineExplanation) return;
    const request = { chunkId: lineExplanation.chunkId, lineIndex: lineExplanation.lineIndex };
    pendingLineRequest.current = request;
    const { message: _message, ...withoutMessage } = lineExplanation;
    setLineExplanation({ ...withoutMessage, status: "loading" });
    vscode.postMessage({ type: "ai/explain-line", payload: request });
  };

  return <main>
    <header>
      <div className="eyebrow">学习模式 · {chunkIndex + 1} / {session.chunks.length}</div>
      <div className="title-row">
        <h1>{chunk.title}</h1>
        <nav className="card-navigation" aria-label="切换学习卡片">
          <button className="secondary" disabled={chunkIndex === 0} onClick={() => moveTo(chunkIndex - 1)}>← 上一张</button>
          <button className="primary" disabled={chunkIndex === session.chunks.length - 1} onClick={() => moveTo(chunkIndex + 1)}>下一张 →</button>
        </nav>
      </div>
      <div className="progress" role="progressbar" aria-valuenow={chunkIndex + 1} aria-valuemin={1} aria-valuemax={session.chunks.length}>
        <span style={{ width: `${((chunkIndex + 1) / session.chunks.length) * 100}%` }} />
      </div>
    </header>

    <section className="explanation" aria-label={`${aiProvider.label} 代码解释`} aria-live="polite">
      <div className="explanation-title"><span className="spark">✦</span> {aiProvider.label} 简洁解释</div>
      {explanation.status === "loading" && <p>正在理解当前代码片段…</p>}
      {explanation.status === "ready" && <>
        <AdhdExplanation text={explanation.text} boldRatio={session.settings.boldRatio} />
        {explanation.source === "local" && <span className="local-record">已从 D:\codeLearn 读取</span>}
      </>}
      {explanation.status === "needs-key" && <div className="explanation-setup">
        <p>配置 API Key 后，当前卡片代码会发送给 {aiProvider.label} 生成解释。</p>
        <button className="secondary" onClick={() => vscode.postMessage({ type: "ai/setup" })}>设置 {aiProvider.label} API Key</button>
      </div>}
      {explanation.status === "error" && <div className="explanation-setup error-box">
        <p>{explanation.message}</p>
        <button className="secondary" onClick={retryExplanation}>重试</button>
      </div>}
    </section>

    <section className="card" aria-label="代码学习卡片">
      <pre><AdhdText segments={chunk.tokenSegments} blankBySegment={blankBySegment} onExplainLine={explainLine} /></pre>
    </section>

    <section className="quiz" aria-label="候选词">
      {speaking && <p className="hint" aria-live="polite">正在英语朗读，你可以同时填写空位。</p>}
      <div className="choices">
          {chunk.quiz.choices.map((choice) => <button
            key={choice.id}
            className={choice.syntaxKind && choice.syntaxKind !== "plain" ? `syntax-${choice.syntaxKind}` : undefined}
            disabled={used.has(choice.id) || quizState.completed}
          onClick={() => onChoice(choice.id)}
        >{choice.text}</button>)}
      </div>
      <p className={quizState.error ? "feedback error" : "feedback"} aria-live="polite">
        {quizState.error ?? (quizState.completed ? "✓ 很好，所有词都回到了正确位置。" : "按源码顺序选择下一个词。")}
      </p>
      <div className="quiz-actions">
        <button className="secondary" onClick={() => setQuizState(undoAnswer(quizState))} disabled={quizState.answers.length === 0}>撤销</button>
        <button className="secondary" onClick={() => setQuizState(initialQuizState())}>重新开始</button>
      </div>
    </section>

    <footer className="page-actions">
      <button className="secondary" onClick={speak} disabled={speaking}>{speaking ? "正在朗读…" : "▶ 英语重播"}</button>
      <button className="secondary" onClick={() => vscode.postMessage({ type: "source/reveal", payload: { uri: chunk.sourceUri, range: chunk.sourceRange } })}>在源码中定位</button>
    </footer>
    {lineExplanation && <DraggableLineExplanation
      value={lineExplanation}
      boldRatio={session.settings.boldRatio}
      providerName={aiProvider.label}
      onClose={() => {
        setLineExplanation(null);
        pendingLineRequest.current = null;
      }}
      onRetry={retryLineExplanation}
      onSetup={() => vscode.postMessage({ type: "ai/setup" })}
    />}
  </main>;
}
