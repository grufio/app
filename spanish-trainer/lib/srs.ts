import { shuffle, type Rng } from "./rng";
import type { MatchResult } from "./answer-match";
import { getActiveUser, type UserId } from "./user";

export const MAX_BOX = 5;

export interface SrsEntry {
  box: number; // 1..MAX_BOX — higher = better known
  seen: number;
  correct: number;
}

export type SrsMap = Record<string, SrsEntry>;

function srsKey(user: UserId): string {
  return `spanish-trainer:srs:${user}`;
}

export function loadSrs(user: UserId = getActiveUser()): SrsMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(srsKey(user));
    return raw ? (JSON.parse(raw) as SrsMap) : {};
  } catch {
    return {};
  }
}

export function saveSrs(map: SrsMap, user: UserId = getActiveUser()): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(srsKey(user), JSON.stringify(map));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

/** Remove a profile's stored SRS data (used by the admin reset). */
export function clearSrs(user: UserId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(srsKey(user));
  } catch {
    /* ignore */
  }
}

/**
 * Remove only the given question ids from a profile's SRS map (used by the
 * per-area admin reset). Ids that aren't present are ignored.
 */
export function clearSrsIds(user: UserId, ids: readonly string[]): void {
  if (ids.length === 0) return;
  const map = loadSrs(user);
  let changed = false;
  for (const id of ids) {
    if (id in map) {
      delete map[id];
      changed = true;
    }
  }
  if (changed) saveSrs(map, user);
}

/** Total questions answered (sum of `seen`) — drives the per-profile stat. */
export function totalAnswered(map: SrsMap): number {
  return Object.values(map).reduce((sum, entry) => sum + entry.seen, 0);
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
