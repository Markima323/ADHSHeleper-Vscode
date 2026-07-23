import { describe, expect, it } from "vitest";
import type { ClozeQuizModel } from "@adhd-code-focus/core";
import { chooseAnswer, initialQuizState, undoAnswer } from "./quizState";

const quiz: ClozeQuizModel = {
  seed: "x", maxBlankCount: 2,
  blanks: [
    { id: "b1", answerChoiceId: "c1", text: "alpha", segmentIndex: 0 },
    { id: "b2", answerChoiceId: "c2", text: "beta", segmentIndex: 1 },
  ],
  choices: [{ id: "c2", text: "beta" }, { id: "c1", text: "alpha" }],
};

describe("quiz state", () => {
  it("keeps an incorrect choice available and advances on the correct choice", () => {
    const wrong = chooseAnswer(initialQuizState(), "c2", quiz);
    expect(wrong.answers).toEqual([]);
    expect(wrong.error).not.toBeNull();
    const correct = chooseAnswer(wrong, "c1", quiz);
    expect(correct.answers).toEqual(["c1"]);
  });

  it("supports completion and undo", () => {
    const first = chooseAnswer(initialQuizState(), "c1", quiz);
    const done = chooseAnswer(first, "c2", quiz);
    expect(done.completed).toBe(true);
    expect(undoAnswer(done)).toMatchObject({ answers: ["c1"], completed: false });
  });
});
