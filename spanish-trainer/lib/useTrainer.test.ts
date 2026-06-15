import { describe, expect, it } from "vitest";
import {
  createInitialState,
  LEVEL_SIZE,
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
    s = trainerReducer(s, { type: "ANSWER_TYPED", result: "correct" }); // index 0 correct
    s = trainerReducer(s, { type: "NEXT" }); // index 1, fresh
    expect(s.index).toBe(1);
    expect(s.status).toBe("playing");

    s = trainerReducer(s, { type: "ANSWER_TYPED", result: "wrong" }); // index 1 wrong
    const scoreSnapshot = s.score;

    s = trainerReducer(s, { type: "PREV" }); // back to index 0
    expect(s.index).toBe(0);
    expect(s.status).toBe("answered");
    expect(s.lastResult).toBe("correct");
    expect(s.score).toBe(scoreSnapshot);

    s = trainerReducer(s, { type: "NEXT" }); // forward into the answered index 1
    expect(s.status).toBe("answered");
    expect(s.lastResult).toBe("wrong");
    expect(s.score).toBe(scoreSnapshot);
  });

  it("raises the game-over dialog immediately on the 5th mistake", () => {
    let s = createInitialState(items, 7);
    for (let i = 0; i < MAX_MISTAKES - 1; i++) {
      s = trainerReducer(s, { type: "ANSWER_TYPED", result: "wrong" });
      s = trainerReducer(s, { type: "NEXT" });
    }
    expect(s.mistakes).toBe(MAX_MISTAKES - 1);
    s = trainerReducer(s, { type: "ANSWER_TYPED", result: "wrong" }); // 5th mistake
    expect(s.mistakes).toBe(MAX_MISTAKES);
    expect(s.status).toBe("gameover");
  });

  it("crossing a level boundary parks on the level-up interstitial (Weiter/Zurück)", () => {
    let s = createInitialState(items, 99);
    for (let i = 0; i < LEVEL_SIZE; i++) {
      s = trainerReducer(s, { type: "ANSWER_TYPED", result: "correct" });
      if (i < LEVEL_SIZE - 1) s = trainerReducer(s, { type: "NEXT" });
    }
    expect(s.index).toBe(LEVEL_SIZE - 1);

    s = trainerReducer(s, { type: "NEXT" }); // cross the boundary
    expect(s.status).toBe("levelup");
    expect(s.level).toBe(2);
    expect(s.index).toBe(LEVEL_SIZE);

    expect(trainerReducer(s, { type: "PREV" })).toMatchObject({
      status: "answered",
      index: LEVEL_SIZE - 1,
    });
    expect(trainerReducer(s, { type: "NEXT" })).toMatchObject({
      status: "playing",
      index: LEVEL_SIZE,
    });
  });

  it("reaches the result screen after the whole deck is answered", () => {
    let s = createInitialState(items, 5);
    let guard = 0;
    while (s.status !== "won" && guard++ < 500) {
      if (s.status === "playing") {
        s = trainerReducer(s, { type: "ANSWER_TYPED", result: "correct" });
      } else {
        s = trainerReducer(s, { type: "NEXT" }); // answered or levelup
      }
    }
    expect(s.status).toBe("won");
    expect(s.score).toBeGreaterThan(0);
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

  it("restart reshuffles and clears all progress", () => {
    let s = createInitialState(items, 7);
    s = trainerReducer(s, { type: "ANSWER_TYPED", result: "wrong" });
    const restarted = trainerReducer(s, { type: "RESTART" });
    expect(restarted.mistakes).toBe(0);
    expect(restarted.score).toBe(0);
    expect(restarted.lives).toBe(MAX_MISTAKES);
    expect(restarted.status).toBe("playing");
    expect(restarted.index).toBe(0);
  });
});
