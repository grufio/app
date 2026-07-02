import { clearSrs, clearSrsIds, MAX_BOX, type SrsMap } from "./srs";
import { clearHighScore } from "./scoring";
import type { UserId } from "./user";

/**
 * Run log + statistics helpers. The run log records every completed test run
 * (who, which test, when, score, outcome) so the admin area can show "who did
 * which test when". The analytics helpers (`testStats`, `runStats`, …) are pure
 * and unit-tested.
 */

export interface RunEntry {
  user: UserId;
  testId: string;
  /** Epoch ms when the run finished. */
  at: number;
  score: number;
  /** Number of questions in the run (deck length). */
  total: number;
  outcome: "won" | "gameover";
}

const RUNS_KEY = "spanish-trainer:runs";
const MAX_RUNS = 500;
/** Learner profiles whose stats the admin reset clears. */
const LEARNERS: UserId[] = ["q", "r"];

export function loadRuns(): RunEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RUNS_KEY);
    return raw ? (JSON.parse(raw) as RunEntry[]) : [];
  } catch {
    return [];
  }
}

export function appendRun(entry: RunEntry): void {
  if (typeof window === "undefined") return;
  try {
    const runs = loadRuns();
    runs.push(entry);
    window.localStorage.setItem(RUNS_KEY, JSON.stringify(runs.slice(-MAX_RUNS)));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

export function clearRuns(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RUNS_KEY);
  } catch {
    /* ignore */
  }
}

/** Reset all learner statistics: run log + SRS + high scores of Q and R. */
export function resetAllStats(): void {
  clearRuns();
  for (const user of LEARNERS) {
    clearSrs(user);
    clearHighScore(user);
  }
}

/** Remove one profile's runs for the given tests; other users/tests stay. */
export function clearRunsForGroup(user: UserId, testIds: readonly string[]): void {
  if (typeof window === "undefined" || testIds.length === 0) return;
  const drop = new Set(testIds);
  const kept = loadRuns().filter((run) => !(run.user === user && drop.has(run.testId)));
  try {
    window.localStorage.setItem(RUNS_KEY, JSON.stringify(kept.slice(-MAX_RUNS)));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

/**
 * Reset one group (e.g. an area) for a learner: its questions' SRS entries and
 * its tests' runs. The per-profile high score is intentionally left alone — it
 * is a single value that can't be split per group (only `resetAllStats` clears it).
 */
export function resetGroup(
  user: UserId,
  itemIds: readonly string[],
  testIds: readonly string[],
): void {
  clearSrsIds(user, itemIds);
  clearRunsForGroup(user, testIds);
}

// ---- pure analytics (no DOM / localStorage) ----

export interface TestStats {
  total: number;
  /** Questions answered at least once. */
  practiced: number;
  /** Questions in the top Leitner box (mastered). */
  mastered: number;
  /** Correct / seen over all seen questions; null if none seen yet. */
  accuracy: number | null;
}

export function testStats(itemIds: readonly string[], srs: SrsMap): TestStats {
  let seen = 0;
  let correct = 0;
  let practiced = 0;
  let mastered = 0;
  for (const id of itemIds) {
    const entry = srs[id];
    if (!entry) continue;
    if (entry.seen > 0) practiced += 1;
    seen += entry.seen;
    correct += entry.correct;
    if (entry.box >= MAX_BOX) mastered += 1;
  }
  return {
    total: itemIds.length,
    practiced,
    mastered,
    accuracy: seen > 0 ? correct / seen : null,
  };
}

export interface RunSummary {
  runs: number;
  bestScore: number;
  lastAt: number | null;
}

export function runStats(
  runs: readonly RunEntry[],
  user: UserId,
  testId: string,
): RunSummary {
  let count = 0;
  let bestScore = 0;
  let lastAt: number | null = null;
  for (const run of runs) {
    if (run.user !== user || run.testId !== testId) continue;
    count += 1;
    if (run.score > bestScore) bestScore = run.score;
    if (lastAt === null || run.at > lastAt) lastAt = run.at;
  }
  return { runs: count, bestScore, lastAt };
}

export function learnerLastActive(runs: readonly RunEntry[], user: UserId): number | null {
  let last: number | null = null;
  for (const run of runs) {
    if (run.user === user && (last === null || run.at > last)) last = run.at;
  }
  return last;
}
