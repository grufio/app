import { shuffle, type Rng } from "./rng";
import { boxFor, type SrsMap } from "./srs";

/** Topic buckets for the physics ("Physik Kompakt") multiple-choice tests. */
export type PhysikTopic =
  | "Optik"
  | "Akustik"
  | "Stromkreis"
  | "Magnetismus"
  | "Größen";

/** Topic buckets for the German grammar ("Deutsch") multiple-choice tests. */
export type DeutschTopic =
  | "Aktiv/Passiv"
  | "Wortarten"
  | "Satzglieder"
  | "Feldermodell"
  | "Attribute"
  | "Tempus";

/** Every topic an mc question can carry, across all subjects. */
export type McTopic = PhysikTopic | DeutschTopic;

/**
 * A curated multiple-choice question. Unlike the vocabulary game, the answer
 * options are authored by hand (not derived from a translation pool), so the
 * correct option is marked by index and the distractors live alongside it.
 */
export interface McItem {
  /** Stable unique id, topic-prefixed (e.g. "opt-reflexionsgesetz"). */
  id: string;
  /** The question text shown to the learner. */
  stem: string;
  /** Answer options — exactly one is correct (see `correctIndex`). */
  options: string[];
  /** Index of the correct option within `options`. */
  correctIndex: number;
  topic: McTopic;
}

export interface McQuestion {
  item: McItem;
  /** The question text shown to the learner. */
  stem: string;
  /** The correct option text (resolved before shuffling). */
  answer: string;
  /** The options in a deterministically shuffled order. */
  options: string[];
}

/**
 * Build a multiple-choice question for `item`. The correct option is captured
 * by value *before* shuffling, so its on-screen position is irrelevant — the
 * UI compares the picked string against `answer`. Same `rng` ⇒ same order.
 */
export function buildMcQuestion(item: McItem, rng: Rng): McQuestion {
  const answer = item.options[item.correctIndex];
  const options = shuffle(item.options, rng);
  return { item, stem: item.stem, answer, options };
}

/**
 * Build a session deck in random order, but with the least-known questions
 * first: shuffle (random within a knowledge level), then stable-sort by the
 * Leitner box ascending, so wrong / not-yet-mastered questions (low box) come
 * before well-known ones. No question is skipped.
 */
export function buildMcDeck(
  items: readonly McItem[],
  srs: SrsMap,
  rng: Rng,
): McItem[] {
  return shuffle(items, rng).sort((a, b) => boxFor(srs, a.id) - boxFor(srs, b.id));
}
