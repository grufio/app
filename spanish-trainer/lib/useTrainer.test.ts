import { describe, expect, it } from "vitest";
import {
  createInitialState,
  isDeckComplete,
  MAX_MISTAKES,
  trainerReducer,
  type TrainerState,
} from "./useTrainer";
import type { VocabItem } from "./types";

const items: VocabItem[] = Array.from({ length: 20 }, (_, i) => ({
  id: `w${i}`,
  es: `es${i}`,
  de: `de${i}`,
  type: "noun",
  unit: 5,
}));

function wrongOption(state: TrainerState): string {
  return state.question.options.find((o) => o !== state.question.answer)!;
}

/** Answer the current question correctly, then navigate forward one. */
function answerCorrect(state: TrainerState): TrainerState {
  const answered = trainerReducer(state, {
    type: "ANSWER",
    option: state.question.answer,
  });
  return trainerReducer(answered, { type: "NEXT" });
}

describe("trainerReducer", () => {
  it("scores a correct answer instantly and builds a streak — without advancing", () => {
    const s0 = createInitialState(items, 123);
    const answered = trainerReducer(s0, { type: "ANSWER", option: s0.question.answer });
    expect(answered.status).toBe("answered");
    expect(answered.lastCorrect).toBe(true);
    expect(answered.score).toBeGreaterThan(0);
    expect(answered.streak).toBe(1);
    expect(answered.index).toBe(0); // no auto-advance
    expect(answered.answers[0]).toMatchObject({ correct: true, result: "correct" });
  });

  it("counts a wrong answer, drops a life and resets the streak", () => {
    let s = createInitialState(items, 123);
    s = answerCorrect(s); // streak now 1, at index 1
    const wrong = trainerReducer(s, { type: "ANSWER", option: wrongOption(s) });
    expect(wrong.lastCorrect).toBe(false);
    expect(wrong.mistakes).toBe(1);
    expect(wrong.lives).toBe(MAX_MISTAKES - 1);
    expect(wrong.streak).toBe(0);
  });

  it("ANSWER_TYPED grades correct / almost / wrong distinctly and stores the result", () => {
    const base = createInitialState(items, 3);

    const correct = trainerReducer(base, { type: "ANSWER_TYPED", result: "correct" });
    expect(correct.lastResult).toBe("correct");
    expect(correct.lives).toBe(MAX_MISTAKES);
    expect(correct.score).toBeGreaterThan(0);
    expect(correct.answers[0]).toMatchObject({ result: "correct", selected: null });

    const almost = trainerReducer(base, { type: "ANSWER_TYPED", result: "almost" });
    expect(almost.lastResult).toBe("almost");
    expect(almost.lives).toBe(MAX_MISTAKES); // no life lost
    expect(almost.score).toBe(0);

    const wrong = trainerReducer(base, { type: "ANSWER_TYPED", result: "wrong" });
    expect(wrong.lastResult).toBe("wrong");
    expect(wrong.lives).toBe(MAX_MISTAKES - 1);
    expect(wrong.mistakes).toBe(1);
  });

  it("ANSWER on an already-answered question is a no-op", () => {
    let s = createInitialState(items, 123);
    s = trainerReducer(s, { type: "ANSWER", option: s.question.answer });
    const again = trainerReducer(s, { type: "ANSWER", option: wrongOption(s) });
    expect(again).toBe(s);
  });

  it("NEXT/PREV navigate without re-grading; revisiting restores the stored answer", () => {
    let s = createInitialState(items, 5);
    const q0 = s.question.answer;
    s = trainerReducer(s, { type: "ANSWER", option: q0 }); // index 0 correct
    s = trainerReducer(s, { type: "NEXT" }); // index 1, fresh
    expect(s.index).toBe(1);
    expect(s.status).toBe("playing");

    const wrong1 = wrongOption(s);
    s = trainerReducer(s, { type: "ANSWER", option: wrong1 }); // index 1 wrong
    const scoreSnapshot = s.score;

    s = trainerReducer(s, { type: "PREV" }); // back to index 0
    expect(s.index).toBe(0);
    expect(s.status).toBe("answered");
    expect(s.selected).toBe(q0);
    expect(s.lastResult).toBe("correct");
    expect(s.score).toBe(scoreSnapshot);

    s = trainerReducer(s, { type: "NEXT" }); // forward into the answered index 1
    expect(s.status).toBe("answered");
    expect(s.selected).toBe(wrong1);
    expect(s.lastResult).toBe("wrong");
    expect(s.score).toBe(scoreSnapshot);
  });

  it("USE_HINT increments hintsUsed; restart resets it and answers", () => {
    let s = createInitialState(items, 1);
    expect(s.hintsUsed).toBe(0);
    s = trainerReducer(s, { type: "USE_HINT" });
    s = trainerReducer(s, { type: "USE_HINT" });
    expect(s.hintsUsed).toBe(2);
    const restarted = trainerReducer(s, { type: "RESTART" });
    expect(restarted.hintsUsed).toBe(0);
    expect(restarted.answers).toEqual({});
  });

  it("isDeckComplete flips true only after every question is answered", () => {
    let s = createInitialState(items, 5);
    expect(isDeckComplete(s)).toBe(false);
    for (let i = 0; i < s.deck.length; i++) {
      s = trainerReducer(s, { type: "ANSWER_TYPED", result: "correct" });
      if (i < s.deck.length - 1) s = trainerReducer(s, { type: "NEXT" });
    }
    expect(isDeckComplete(s)).toBe(true);
  });

  it("restart reshuffles and clears all progress", () => {
    let s = createInitialState(items, 7);
    s = trainerReducer(s, { type: "ANSWER", option: wrongOption(s) });
    const restarted = trainerReducer(s, { type: "RESTART" });
    expect(restarted.mistakes).toBe(0);
    expect(restarted.score).toBe(0);
    expect(restarted.lives).toBe(MAX_MISTAKES);
    expect(restarted.status).toBe("playing");
    expect(restarted.index).toBe(0);
  });
});
