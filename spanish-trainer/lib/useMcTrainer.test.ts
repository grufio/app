import { describe, expect, it } from "vitest";
import {
  createInitialState,
  LEVEL_SIZE,
  MAX_MISTAKES,
  mcTrainerReducer,
  type McTrainerState,
} from "./useMcTrainer";
import type { McItem } from "./mc";

const items: McItem[] = Array.from({ length: 20 }, (_, i) => ({
  id: `q${i}`,
  stem: `Frage ${i}?`,
  options: [`A${i}`, `B${i}`, `C${i}`, `D${i}`],
  correctIndex: i % 4,
  topic: "Optik",
}));

function wrongOption(state: McTrainerState): string {
  return state.question.options.find((o) => o !== state.question.answer)!;
}

function answerCorrect(state: McTrainerState): McTrainerState {
  const answered = mcTrainerReducer(state, {
    type: "ANSWER",
    option: state.question.answer,
  });
  return mcTrainerReducer(answered, { type: "NEXT" });
}

describe("mcTrainerReducer", () => {
  it("scores a correct answer and builds a streak", () => {
    const s0 = createInitialState(items, 123);
    const answered = mcTrainerReducer(s0, { type: "ANSWER", option: s0.question.answer });
    expect(answered.status).toBe("answered");
    expect(answered.lastCorrect).toBe(true);
    expect(answered.score).toBeGreaterThan(0);
    expect(answered.streak).toBe(1);
  });

  it("counts a wrong answer, drops a life and resets the streak", () => {
    let s = createInitialState(items, 123);
    s = answerCorrect(s); // streak now 1
    const wrong = mcTrainerReducer(s, { type: "ANSWER", option: wrongOption(s) });
    expect(wrong.lastCorrect).toBe(false);
    expect(wrong.mistakes).toBe(1);
    expect(wrong.lives).toBe(MAX_MISTAKES - 1);
    expect(wrong.streak).toBe(0);
  });

  it("applies the combo multiplier (4th correct in a row uses ×1.5)", () => {
    let s = createInitialState(items, 5);
    s = answerCorrect(s); // streak 1
    s = answerCorrect(s); // streak 2
    s = answerCorrect(s); // streak 3
    const fourth = mcTrainerReducer(s, { type: "ANSWER", option: s.question.answer });
    expect(fourth.streak).toBe(4);
    expect(fourth.lastGain).toBe(15); // round(10 * 1.5)
  });

  it("ends the game after 5 mistakes", () => {
    let s = createInitialState(items, 7);
    for (let i = 0; i < MAX_MISTAKES; i++) {
      s = mcTrainerReducer(s, { type: "ANSWER", option: wrongOption(s) });
      s = mcTrainerReducer(s, { type: "NEXT" });
    }
    expect(s.mistakes).toBe(MAX_MISTAKES);
    expect(s.status).toBe("gameover");
  });

  it("shows a level-up checkpoint when crossing a level boundary", () => {
    let s = createInitialState(items, 99);
    for (let i = 0; i < LEVEL_SIZE; i++) s = answerCorrect(s);
    expect(s.status).toBe("levelup");
    expect(s.level).toBe(2);
    const resumed = mcTrainerReducer(s, { type: "DISMISS_LEVELUP" });
    expect(resumed.status).toBe("playing");
  });

  it("wins after the whole deck is answered", () => {
    let s = createInitialState(items, 5);
    let guard = 0;
    while (s.status !== "won" && guard++ < 200) {
      if (s.status === "levelup") {
        s = mcTrainerReducer(s, { type: "DISMISS_LEVELUP" });
        continue;
      }
      s = answerCorrect(s);
    }
    expect(s.status).toBe("won");
    expect(s.score).toBeGreaterThan(0);
  });

  it("restart reshuffles and clears all progress", () => {
    let s = createInitialState(items, 7);
    s = mcTrainerReducer(s, { type: "ANSWER", option: wrongOption(s) });
    s = mcTrainerReducer(s, { type: "NEXT" });
    const restarted = mcTrainerReducer(s, { type: "RESTART" });
    expect(restarted.mistakes).toBe(0);
    expect(restarted.score).toBe(0);
    expect(restarted.lives).toBe(MAX_MISTAKES);
    expect(restarted.status).toBe("playing");
    expect(restarted.index).toBe(0);
  });
});
