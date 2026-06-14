import { describe, expect, it } from "vitest";
import { learnerLastActive, runStats, testStats, type RunEntry } from "./stats";
import type { SrsMap } from "./srs";

describe("testStats", () => {
  const srs: SrsMap = {
    a: { box: 5, seen: 4, correct: 3 }, // mastered, seen
    b: { box: 1, seen: 2, correct: 0 }, // seen, weak
    // c: not in srs (never seen)
  };

  it("counts practiced/mastered and computes accuracy over seen questions", () => {
    const s = testStats(["a", "b", "c"], srs);
    expect(s.total).toBe(3);
    expect(s.practiced).toBe(2);
    expect(s.mastered).toBe(1);
    expect(s.accuracy).toBeCloseTo(3 / 6); // 3 correct of 6 seen
  });

  it("returns null accuracy when nothing has been seen", () => {
    const s = testStats(["x", "y"], {});
    expect(s).toEqual({ total: 2, practiced: 0, mastered: 0, accuracy: null });
  });
});

describe("runStats / learnerLastActive", () => {
  const runs: RunEntry[] = [
    { user: "r", testId: "opt-licht", at: 100, score: 50, total: 12, outcome: "won" },
    { user: "r", testId: "opt-licht", at: 200, score: 80, total: 12, outcome: "won" },
    { user: "q", testId: "unidad5", at: 150, score: 30, total: 20, outcome: "gameover" },
    { user: "r", testId: "aku-ton", at: 300, score: 40, total: 14, outcome: "gameover" },
  ];

  it("aggregates run count, best score and last time per user+test", () => {
    expect(runStats(runs, "r", "opt-licht")).toEqual({ runs: 2, bestScore: 80, lastAt: 200 });
    expect(runStats(runs, "r", "aku-ton")).toEqual({ runs: 1, bestScore: 40, lastAt: 300 });
    expect(runStats(runs, "r", "mag-pole")).toEqual({ runs: 0, bestScore: 0, lastAt: null });
  });

  it("reports the most recent activity per learner", () => {
    expect(learnerLastActive(runs, "r")).toBe(300);
    expect(learnerLastActive(runs, "q")).toBe(150);
    expect(learnerLastActive(runs, "admin")).toBeNull();
  });
});
