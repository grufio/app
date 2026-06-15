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

/** Answer the current question correctly, then navigate forward one step. */
function answerCorrect(state: McTrainerState): McTrainerState {
  const answered = mcTrainerReducer(state, {
    type: "ANSWER",
    option: state.question.answer,
  });
  return mcTrainerReducer(answered, { type: "NEXT" });
}

describe("mcTrainerReducer", () => {
  it("scores a correct answer instantly and builds a streak — without advancing", () => {
    const s0 = createInitialState(items, 123);
    const answered = mcTrainerReducer(s0, { type: "ANSWER", option: s0.question.answer });
    expect(answered.status).toBe("answered");
    expect(answered.lastCorrect).toBe(true);
    expect(answered.score).toBeGreaterThan(0);
    expect(answered.streak).toBe(1);
    expect(answered.index).toBe(0); // no auto-advance
    expect(answered.answers[0]).toMatchObject({ correct: true });
  });

  it("counts a wrong answer, drops a life and resets the streak", () => {
    let s = createInitialState(items, 123);
    s = answerCorrect(s); // streak now 1, at index 1
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

  it("ANSWER on an already-answered question is a no-op", () => {
    let s = createInitialState(items, 123);
    s = mcTrainerReducer(s, { type: "ANSWER", option: s.question.answer });
    const again = mcTrainerReducer(s, { type: "ANSWER", option: wrongOption(s) });
    expect(again).toBe(s);
  });

  it("NEXT/PREV navigate without re-grading; revisiting restores the stored answer", () => {
    let s = createInitialState(items, 5);
    const q0 = s.question.answer;
    s = mcTrainerReducer(s, { type: "ANSWER", option: q0 }); // index 0 correct
    s = mcTrainerReducer(s, { type: "NEXT" }); // index 1, fresh
    expect(s.index).toBe(1);
    expect(s.status).toBe("playing");

    const wrong1 = wrongOption(s);
    s = mcTrainerReducer(s, { type: "ANSWER", option: wrong1 }); // index 1 wrong
    const scoreSnapshot = s.score;
    const mistakesSnapshot = s.mistakes;

    s = mcTrainerReducer(s, { type: "PREV" }); // back to index 0
    expect(s.index).toBe(0);
    expect(s.status).toBe("answered");
    expect(s.selected).toBe(q0);
    expect(s.lastCorrect).toBe(true);
    expect(s.score).toBe(scoreSnapshot); // navigation never changes score
    expect(s.mistakes).toBe(mistakesSnapshot);

    s = mcTrainerReducer(s, { type: "NEXT" }); // forward into the answered index 1
    expect(s.index).toBe(1);
    expect(s.status).toBe("answered");
    expect(s.selected).toBe(wrong1);
    expect(s.lastCorrect).toBe(false);
    expect(s.score).toBe(scoreSnapshot);
    expect(s.mistakes).toBe(mistakesSnapshot);
  });

  it("PREV at the first question is a no-op", () => {
    const s = createInitialState(items, 5);
    expect(mcTrainerReducer(s, { type: "PREV" })).toBe(s);
  });

  it("raises the game-over dialog immediately on the 5th mistake", () => {
    let s = createInitialState(items, 7);
    for (let i = 0; i < MAX_MISTAKES - 1; i++) {
      s = mcTrainerReducer(s, { type: "ANSWER", option: wrongOption(s) });
      s = mcTrainerReducer(s, { type: "NEXT" });
    }
    expect(s.mistakes).toBe(MAX_MISTAKES - 1);
    s = mcTrainerReducer(s, { type: "ANSWER", option: wrongOption(s) }); // 5th mistake
    expect(s.mistakes).toBe(MAX_MISTAKES);
    expect(s.status).toBe("gameover");
  });

  it("crossing a level boundary parks on the level-up interstitial (Weiter/Zurück)", () => {
    let s = createInitialState(items, 99);
    for (let i = 0; i < LEVEL_SIZE; i++) {
      s = mcTrainerReducer(s, { type: "ANSWER", option: s.question.answer });
      if (i < LEVEL_SIZE - 1) s = mcTrainerReducer(s, { type: "NEXT" });
    }
    expect(s.index).toBe(LEVEL_SIZE - 1);
    expect(s.status).toBe("answered");

    s = mcTrainerReducer(s, { type: "NEXT" }); // cross the boundary
    expect(s.status).toBe("levelup");
    expect(s.level).toBe(2);
    expect(s.index).toBe(LEVEL_SIZE);

    expect(mcTrainerReducer(s, { type: "PREV" })).toMatchObject({
      status: "answered",
      index: LEVEL_SIZE - 1,
    });
    expect(mcTrainerReducer(s, { type: "NEXT" })).toMatchObject({
      status: "playing",
      index: LEVEL_SIZE,
    });
  });

  it("reaches the result screen after the whole deck is answered", () => {
    let s = createInitialState(items, 5);
    let guard = 0;
    while (s.status !== "won" && guard++ < 500) {
      if (s.status === "playing") {
        s = mcTrainerReducer(s, { type: "ANSWER", option: s.question.answer });
      } else {
        s = mcTrainerReducer(s, { type: "NEXT" }); // answered or levelup
      }
    }
    expect(s.status).toBe("won");
    expect(s.score).toBeGreaterThan(0);
  });

  it("restart reshuffles and clears all progress, including answers", () => {
    let s = createInitialState(items, 7);
    s = mcTrainerReducer(s, { type: "ANSWER", option: wrongOption(s) });
    const restarted = mcTrainerReducer(s, { type: "RESTART" });
    expect(restarted.answers).toEqual({});
    expect(restarted.mistakes).toBe(0);
    expect(restarted.score).toBe(0);
    expect(restarted.lives).toBe(MAX_MISTAKES);
    expect(restarted.status).toBe("playing");
    expect(restarted.index).toBe(0);
  });
});
