import { useEffect, useMemo, useRef, useState } from "react";
import type { LearningSessionDto } from "@adhd-code-focus/core";
import { AdhdText } from "./AdhdText";
import { chooseAnswer, initialQuizState, undoAnswer, type QuizState } from "./quizState";
import { vscode } from "./vscode";

export function App() {
  const [session, setSession] = useState<LearningSessionDto | null>(null);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [quizState, setQuizState] = useState<QuizState>(initialQuizState);
  const [speaking, setSpeaking] = useState(false);
  const startedAt = useRef(Date.now());
  const completionSent = useRef(false);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.data?.type === "session/init") setSession(event.data.payload as LearningSessionDto);
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

  if (!session || !chunk) return <main className="loading" aria-live="polite">正在准备学习卡片…</main>;

  const moveTo = (next: number) => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setChunkIndex(next);
    setQuizState(initialQuizState());
  };
  const speak = () => {
    if (!("speechSynthesis" in window)) {
      vscode.postMessage({ type: "tts/unavailable", payload: { locale: session.settings.ttsLocale } });
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(chunk.narrationText);
    utterance.lang = session.settings.ttsLocale;
    utterance.rate = session.settings.ttsRate;
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find((item) => item.lang.toLowerCase().startsWith("de"));
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

  return <main>
    <header>
      <div className="eyebrow">学习模式 · {chunkIndex + 1} / {session.chunks.length}</div>
      <h1>{chunk.title}</h1>
      <div className="progress" role="progressbar" aria-valuenow={chunkIndex + 1} aria-valuemin={1} aria-valuemax={session.chunks.length}>
        <span style={{ width: `${((chunkIndex + 1) / session.chunks.length) * 100}%` }} />
      </div>
    </header>

    <section className="card" aria-label="代码学习卡片">
      <div className="card-actions">
        <button className="secondary" onClick={speak} disabled={speaking}>{speaking ? "正在朗读…" : "▶ 德语朗读"}</button>
        <button className="secondary" onClick={() => vscode.postMessage({ type: "source/reveal", payload: { uri: chunk.sourceUri, range: chunk.sourceRange } })}>在源码中定位</button>
      </div>
      <pre><AdhdText segments={chunk.tokenSegments} blankBySegment={blankBySegment} /></pre>
    </section>

    <section className="quiz" aria-label="候选词">
      <div className="quiz-heading">
        <div><span className="step">当前任务</span><h2>{quizState.completed ? "完成这张卡片" : `填写第 ${quizState.answers.length + 1} 个空位`}</h2></div>
        <span>{quizState.answers.length} / {chunk.quiz.blanks.length}</span>
      </div>
      {speaking ? <p className="hint" aria-live="polite">先听代码朗读，结束后再继续填空。</p> : <>
        <div className="choices">
          {chunk.quiz.choices.map((choice) => <button
            key={choice.id}
            disabled={used.has(choice.id) || quizState.completed}
            onClick={() => onChoice(choice.id)}
          >{choice.text}</button>)}
        </div>
        <p className={quizState.error ? "feedback error" : "feedback"} aria-live="polite">
          {quizState.error ?? (quizState.completed ? "✓ 很好，所有词都回到了正确位置。" : "按源码顺序选择下一个词。")}
        </p>
      </>}
      <div className="quiz-actions">
        <button className="secondary" onClick={() => setQuizState(undoAnswer(quizState))} disabled={quizState.answers.length === 0}>撤销</button>
        <button className="secondary" onClick={() => setQuizState(initialQuizState())}>重新开始</button>
      </div>
    </section>

    <nav>
      <button className="secondary" disabled={chunkIndex === 0} onClick={() => moveTo(chunkIndex - 1)}>← 上一张</button>
      <button className="primary" disabled={chunkIndex === session.chunks.length - 1} onClick={() => moveTo(chunkIndex + 1)}>下一张 →</button>
    </nav>
  </main>;
}
