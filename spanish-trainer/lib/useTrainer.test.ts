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

function answerCorrect(state: TrainerState): TrainerState {
  const answered = trainerReducer(state, {
    type: "ANSWER",
    option: state.question.answer,
  });
  return trainerReducer(answered, { type: "NEXT" });
}

describe("trainerReducer", () => {
  it("scores a correct answer and builds a streak", () => {
    const s0 = createInitialState(items, 123);
    const answered = trainerReducer(s0, { type: "ANSWER", option: s0.question.answer });
    expect(answered.status).toBe("answered");
    expect(answered.lastCorrect).toBe(true);
    expect(answered.score).toBeGreaterThan(0);
    expect(answered.streak).toBe(1);
  });

  it("counts a wrong answer, drops a life and resets the streak", () => {
    let s = createInitialState(items, 123);
    s = trainerReducer(s, { type: "ANSWER", option: s.question.answer });
    s = trainerReducer(s, { type: "NEXT" }); // streak now 1
    const wrong = trainerReducer(s, { type: "ANSWER", option: wrongOption(s) });
    expect(wrong.lastCorrect).toBe(false);
    expect(wrong.mistakes).toBe(1);
    expect(wrong.lives).toBe(MAX_MISTAKES - 1);
    expect(wrong.streak).toBe(0);
  });

  it("ends the game after 5 mistakes", () => {
    let s = createInitialState(items, 7);
    for (let i = 0; i < MAX_MISTAKES; i++) {
      s = trainerReducer(s, { type: "ANSWER", option: wrongOption(s) });
      s = trainerReducer(s, { type: "NEXT" });
    }
    expect(s.mistakes).toBe(MAX_MISTAKES);
    expect(s.status).toBe("gameover");
  });

  it("restart reshuffles and clears all progress", () => {
    let s = createInitialState(items, 7);
    s = trainerReducer(s, { type: "ANSWER", option: wrongOption(s) });
    s = trainerReducer(s, { type: "NEXT" });
    const restarted = trainerReducer(s, { type: "RESTART" });
    expect(restarted.mistakes).toBe(0);
    expect(restarted.score).toBe(0);
    expect(restarted.lives).toBe(MAX_MISTAKES);
    expect(restarted.status).toBe("playing");
    expect(restarted.index).toBe(0);
  });

  it("shows a level-up checkpoint when crossing a level boundary", () => {
    let s = createInitialState(items, 99);
    for (let i = 0; i < LEVEL_SIZE; i++) s = answerCorrect(s);
    expect(s.status).toBe("levelup");
    expect(s.level).toBe(2);
    const resumed = trainerReducer(s, { type: "DISMISS_LEVELUP" });
    expect(resumed.status).toBe("playing");
  });

  it("wins after the whole deck is answered", () => {
    let s = createInitialState(items, 5);
    let guard = 0;
    while (s.status !== "won" && guard++ < 200) {
      if (s.status === "levelup") {
        s = trainerReducer(s, { type: "DISMISS_LEVELUP" });
        continue;
      }
      s = answerCorrect(s);
    }
    expect(s.status).toBe("won");
    expect(s.score).toBeGreaterThan(0);
  });

  it("USE_HINT increments hintsUsed; restart and init reset it", () => {
    let s = createInitialState(items, 1);
    expect(s.hintsUsed).toBe(0);
    s = trainerReducer(s, { type: "USE_HINT" });
    s = trainerReducer(s, { type: "USE_HINT" });
    expect(s.hintsUsed).toBe(2);
    expect(trainerReducer(s, { type: "RESTART" }).hintsUsed).toBe(0);
  });
});
