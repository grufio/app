import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendRun,
  learnerLastActive,
  loadRuns,
  resetAllStats,
  resetGroup,
  runStats,
  testStats,
  type RunEntry,
} from "./stats";
import { loadSrs, recordResult, saveSrs, totalAnswered, type SrsMap } from "./srs";
import { loadHighScore, saveHighScore } from "./scoring";

/** Minimal in-memory localStorage so the persistence helpers work under node. */
function localStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
}

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

describe("resetAllStats", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: localStorageMock() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clears each child's right/wrong (SRS), high scores and the run log", () => {
    // Seed Q and R with answered questions, high scores and completed runs.
    saveSrs(recordResult(loadSrs("q"), "unidad5-a", "correct"), "q");
    saveSrs(recordResult(loadSrs("r"), "opt-licht-a", "wrong"), "r");
    saveHighScore({ score: 120, level: 3 }, "q");
    saveHighScore({ score: 90, level: 2 }, "r");
    appendRun({ user: "q", testId: "unidad5", at: 1, score: 120, total: 20, outcome: "won" });
    appendRun({ user: "r", testId: "opt-licht", at: 2, score: 90, total: 12, outcome: "gameover" });

    // Precondition: the data is actually there.
    expect(totalAnswered(loadSrs("q"))).toBe(1);
    expect(totalAnswered(loadSrs("r"))).toBe(1);
    expect(loadHighScore("q").score).toBe(120);
    expect(loadRuns()).toHaveLength(2);

    resetAllStats();

    // Both children's right/wrong is gone and every counter reads empty.
    expect(loadSrs("q")).toEqual({});
    expect(loadSrs("r")).toEqual({});
    expect(totalAnswered(loadSrs("q"))).toBe(0);
    expect(totalAnswered(loadSrs("r"))).toBe(0);
    expect(loadHighScore("q").score).toBe(0);
    expect(loadHighScore("r").score).toBe(0);
    expect(loadRuns()).toEqual([]);
  });
});

describe("resetGroup", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: localStorageMock() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clears only the group's questions and runs, leaving the rest intact", () => {
    // R has two areas seeded: Optik (opt-licht) and Akustik (aku-ton).
    saveSrs(recordResult(loadSrs("r"), "opt-licht-1", "correct"), "r");
    saveSrs(recordResult(loadSrs("r"), "aku-ton-1", "correct"), "r");
    saveHighScore({ score: 90, level: 2 }, "r");
    // Q has its own data that must stay untouched.
    saveSrs(recordResult(loadSrs("q"), "unidad5-1", "correct"), "q");
    appendRun({ user: "r", testId: "opt-licht", at: 1, score: 50, total: 12, outcome: "won" });
    appendRun({ user: "r", testId: "aku-ton", at: 2, score: 40, total: 14, outcome: "won" });
    appendRun({ user: "q", testId: "unidad5", at: 3, score: 30, total: 20, outcome: "won" });

    // Reset only R's Optik area.
    resetGroup("r", ["opt-licht-1"], ["opt-licht"]);

    // Optik gone for R…
    expect(loadSrs("r")["opt-licht-1"]).toBeUndefined();
    expect(runStats(loadRuns(), "r", "opt-licht").runs).toBe(0);
    // …but Akustik, Q and the high score are untouched.
    expect(loadSrs("r")["aku-ton-1"]).toBeDefined();
    expect(runStats(loadRuns(), "r", "aku-ton").runs).toBe(1);
    expect(loadSrs("q")["unidad5-1"]).toBeDefined();
    expect(runStats(loadRuns(), "q", "unidad5").runs).toBe(1);
    expect(loadHighScore("r").score).toBe(90);
  });
});
