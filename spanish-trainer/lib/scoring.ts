import type { VocabItem } from "./types";
import { getActiveUser, type UserId } from "./user";

export const BASE_POINTS = 10;
export const CONJUGATION_BONUS = 5;

function hiscoreKey(user: UserId): string {
  return `spanish-trainer:highscore:${user}`;
}

/**
 * Combo multiplier grows with the current streak of correct answers and
 * resets to 1 when a mistake is made. Rewards staying focused.
 */
export function comboMultiplier(streak: number): number {
  if (streak >= 10) return 3;
  if (streak >= 6) return 2;
  if (streak >= 3) return 1.5;
  return 1;
}

/**
 * Points awarded for answering `item` correctly, given the streak *before*
 * this answer (so the first correct answer of a combo uses multiplier 1).
 */
export function pointsFor(item: VocabItem, streakBefore: number): number {
  const base = BASE_POINTS + (item.type === "conjugation" ? CONJUGATION_BONUS : 0);
  return Math.round(base * comboMultiplier(streakBefore));
}

export interface HighScore {
  score: number;
  level: number;
}

export function loadHighScore(user: UserId = getActiveUser()): HighScore {
  if (typeof window === "undefined") return { score: 0, level: 0 };
  try {
    const raw = window.localStorage.getItem(hiscoreKey(user));
    if (!raw) return { score: 0, level: 0 };
    const parsed = JSON.parse(raw) as Partial<HighScore>;
    return { score: parsed.score ?? 0, level: parsed.level ?? 0 };
  } catch {
    return { score: 0, level: 0 };
  }
}

/** Persist `candidate` if it beats the stored score. Returns the kept record. */
export function saveHighScore(
  candidate: HighScore,
  user: UserId = getActiveUser(),
): HighScore {
  const current = loadHighScore(user);
  const best: HighScore =
    candidate.score > current.score ? candidate : current;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(hiscoreKey(user), JSON.stringify(best));
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }
  return best;
}
