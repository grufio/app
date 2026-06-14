import { shuffle, type Rng } from "../rng";

/**
 * Self-contained persistence + scoring for the physics trainer. A small,
 * physics-only mirror of the Spanish srs/scoring helpers — Leitner spaced
 * repetition keyed by question id, stored under its own `physik-trainer:`
 * namespace so it shares nothing with the Spanish trainer. Single learner R.
 */

export const MAX_BOX = 5;
export const BASE_POINTS = 10;

export type McResult = "correct" | "wrong";

export interface SrsEntry {
  box: number; // 1..MAX_BOX — higher = better known
  seen: number;
  correct: number;
}

export type SrsMap = Record<string, SrsEntry>;

const SRS_KEY = "physik-trainer:srs:r";
const HISCORE_KEY = "physik-trainer:highscore:r";

export function loadSrs(): SrsMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SRS_KEY);
    return raw ? (JSON.parse(raw) as SrsMap) : {};
  } catch {
    return {};
  }
}

export function saveSrs(map: SrsMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SRS_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

/** Total questions answered (sum of `seen`) — drives the start-page stat. */
export function totalAnswered(map: SrsMap): number {
  return Object.values(map).reduce((sum, entry) => sum + entry.seen, 0);
}

function entryFor(map: SrsMap, id: string): SrsEntry {
  return map[id] ?? { box: 1, seen: 0, correct: 0 };
}

export function boxFor(map: SrsMap, id: string): number {
  return entryFor(map, id).box;
}

/** Apply a result to a question's Leitner entry, returning a new map (pure). */
export function recordResult(map: SrsMap, id: string, result: McResult): SrsMap {
  const prev = entryFor(map, id);
  const box = result === "correct" ? Math.min(MAX_BOX, prev.box + 1) : 1;
  return {
    ...map,
    [id]: {
      box,
      seen: prev.seen + 1,
      correct: prev.correct + (result === "correct" ? 1 : 0),
    },
  };
}

/** Inclusion probability for a session — mastered questions appear less often. */
function inclusionProbability(box: number): number {
  if (box >= 5) return 0.5;
  if (box >= 4) return 0.8;
  return 1;
}

/** Build a shuffled session deck, weighting weak questions in (id-based). */
export function buildSessionDeck<T extends { id: string }>(
  items: readonly T[],
  map: SrsMap,
  rng: Rng,
): T[] {
  const selected = items.filter(
    (item) => rng() < inclusionProbability(boxFor(map, item.id)),
  );
  const deck = selected.length > 0 ? selected : items.slice();
  return shuffle(deck, rng);
}

/** Combo multiplier grows with the current streak; resets on a mistake. */
export function comboMultiplier(streak: number): number {
  if (streak >= 10) return 3;
  if (streak >= 6) return 2;
  if (streak >= 3) return 1.5;
  return 1;
}

export interface HighScore {
  score: number;
  level: number;
}

export function loadHighScore(): HighScore {
  if (typeof window === "undefined") return { score: 0, level: 0 };
  try {
    const raw = window.localStorage.getItem(HISCORE_KEY);
    if (!raw) return { score: 0, level: 0 };
    const parsed = JSON.parse(raw) as Partial<HighScore>;
    return { score: parsed.score ?? 0, level: parsed.level ?? 0 };
  } catch {
    return { score: 0, level: 0 };
  }
}

/** Persist `candidate` if it beats the stored score. Returns the kept record. */
export function saveHighScore(candidate: HighScore): HighScore {
  const current = loadHighScore();
  const best: HighScore = candidate.score > current.score ? candidate : current;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(HISCORE_KEY, JSON.stringify(best));
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }
  return best;
}
