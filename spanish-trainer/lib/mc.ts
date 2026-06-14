import { shuffle, type Rng } from "./rng";

/** Topic buckets for the physics ("Physik Kompakt") multiple-choice tests. */
export type PhysikTopic =
  | "Optik"
  | "Akustik"
  | "Stromkreis"
  | "Magnetismus"
  | "Größen";

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
  topic: PhysikTopic;
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
