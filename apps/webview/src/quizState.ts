import type { ClozeQuizModel } from "@adhd-code-focus/core";

export type QuizState = {
  answers: string[];
  error: string | null;
  completed: boolean;
};

export const initialQuizState = (): QuizState => ({ answers: [], error: null, completed: false });

export function chooseAnswer(state: QuizState, choiceId: string, quiz: ClozeQuizModel): QuizState {
  if (state.completed) return state;
  const blank = quiz.blanks[state.answers.length];
  if (!blank) return { ...state, completed: true };
  if (blank.answerChoiceId !== choiceId) {
    return { ...state, error: "这个词不属于当前空位，再试一次。" };
  }
  const answers = [...state.answers, choiceId];
  return { answers, error: null, completed: answers.length === quiz.blanks.length };
}

export function undoAnswer(state: QuizState): QuizState {
  if (state.answers.length === 0) return { ...state, error: null };
  return { answers: state.answers.slice(0, -1), error: null, completed: false };
}
