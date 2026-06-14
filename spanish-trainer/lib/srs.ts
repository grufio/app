import type { VocabItem } from "./types";
import { shuffle, type Rng } from "./rng";
import type { MatchResult } from "./answer-match";

export const SRS_KEY = "spanish-trainer:srs";
export const MAX_BOX = 5;

export interface SrsEntry {
  box: number; // 1..MAX_BOX — higher = better known
  seen: number;
  correct: number;
}

export type SrsMap = Record<string, SrsEntry>;

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

function entryFor(map: SrsMap, id: string): SrsEntry {
  return map[id] ?? { box: 1, seen: 0, correct: 0 };
}

export function boxFor(map: SrsMap, id: string): number {
  return entryFor(map, id).box;
}

/** Apply a result to a word's Leitner entry, returning a new map (pure). */
export function recordResult(map: SrsMap, id: string, result: MatchResult): SrsMap {
  const prev = entryFor(map, id);
  let box = prev.box;
  if (result === "correct") box = Math.min(MAX_BOX, prev.box + 1);
  else if (result === "wrong") box = 1;
  else box = Math.min(prev.box, 2); // almost: not mastered → keep it coming back
  return {
    ...map,
    [id]: {
      box,
      seen: prev.seen + 1,
      correct: prev.correct + (result === "correct" ? 1 : 0),
    },
  };
}

/** Inclusion probability for a session — mastered words appear less often. */
function inclusionProbability(box: number): number {
  if (box >= 5) return 0.5;
  if (box >= 4) return 0.8;
  return 1;
}

/**
 * Build a shuffled session deck. Weak words (low box) are always included,
 * mastered ones are sometimes skipped. Crucially NOT sorted by box — the order
 * is shuffled so weak words spread across all levels (and get typed from
 * level 3 on) instead of being front-loaded into the click-only early levels.
 */
export function buildSessionDeck(
  items: readonly VocabItem[],
  map: SrsMap,
  rng: Rng,
): VocabItem[] {
  const selected = items.filter(
    (item) => rng() < inclusionProbability(boxFor(map, item.id)),
  );
  const deck = selected.length > 0 ? selected : items.slice();
  return shuffle(deck, rng);
}
