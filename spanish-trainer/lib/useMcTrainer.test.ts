import { describe, expect, it } from "vitest";
import {
  createInitialState,
  isDeckComplete,
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

/** Answer the current question correctly, then navigate forward one. */
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
    expect(again).toBe(s); // unchanged reference
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

  it("PREV at the first question and NEXT at the last are no-ops", () => {
    const s = createInitialState(items, 5);
    expect(mcTrainerReducer(s, { type: "PREV" })).toBe(s);
    let last = s;
    for (let i = 0; i < last.deck.length - 1; i++) {
      last = mcTrainerReducer(last, { type: "ANSWER", option: last.question.answer });
      last = mcTrainerReducer(last, { type: "NEXT" });
    }
    expect(last.index).toBe(last.deck.length - 1);
    expect(mcTrainerReducer(last, { type: "NEXT" })).toBe(last);
  });

  it("isDeckComplete flips true only after every question is answered", () => {
    let s = createInitialState(items, 5);
    expect(isDeckComplete(s)).toBe(false);
    for (let i = 0; i < s.deck.length; i++) {
      s = mcTrainerReducer(s, { type: "ANSWER", option: s.question.answer });
      if (i < s.deck.length - 1) s = mcTrainerReducer(s, { type: "NEXT" });
    }
    expect(isDeckComplete(s)).toBe(true);
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
