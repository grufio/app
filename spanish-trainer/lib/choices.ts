import type { Direction, VocabItem } from "./types";
import { mulberry32, shuffle, type Rng } from "./rng";
import { isSingleWordTarget } from "./answer-match";

export type QuestionMode = "choice" | "type";

export interface Question {
  item: VocabItem;
  direction: Direction;
  /** "choice" = multiple choice, "type" = the learner types the answer. */
  mode: QuestionMode;
  /** The word shown to the learner (source language). */
  prompt: string;
  /** The correct option text (target language). */
  answer: string;
  /** 5 options (1 correct + 4 distractors), already shuffled (choice mode). */
  options: string[];
}

export const NUM_OPTIONS = 5;
export const TYPE_FROM_LEVEL = 3;

function field(item: VocabItem, lang: "es" | "de"): string {
  return lang === "es" ? item.es : item.de;
}

/**
 * Build a multiple-choice question for `item`, drawing 4 distractors from
 * `pool`. Distractors prefer the same word type so they are plausible, and
 * fall back to any other item if there are not enough of the same type.
 */
export function buildQuestion(
  item: VocabItem,
  pool: readonly VocabItem[],
  rng: Rng,
  direction: Direction,
  mode: QuestionMode = "choice",
): Question {
  const sourceLang = direction === "es-de" ? "es" : "de";
  const targetLang = direction === "es-de" ? "de" : "es";

  const prompt = field(item, sourceLang);
  const answer = field(item, targetLang);

  const others = pool.filter(
    (candidate) => candidate.id !== item.id && field(candidate, targetLang) !== answer,
  );

  const sameType = shuffle(
    others.filter((candidate) => candidate.type === item.type),
    rng,
  );
  const rest = shuffle(
    others.filter((candidate) => candidate.type !== item.type),
    rng,
  );

  const distractors: string[] = [];
  const seen = new Set<string>([answer]);
  for (const candidate of [...sameType, ...rest]) {
    const text = field(candidate, targetLang);
    if (seen.has(text)) continue;
    seen.add(text);
    distractors.push(text);
    if (distractors.length === NUM_OPTIONS - 1) break;
  }

  const options = shuffle([answer, ...distractors], rng);
  return { item, direction, mode, prompt, answer, options };
}

/** Pick a direction for a card deterministically from the seed. */
export function pickDirection(seed: number, index: number): Direction {
  const rng = mulberry32(seed + index * 7919);
  return rng() < 0.5 ? "es-de" : "de-es";
}

/** The target word is a single word, so it can reasonably be typed. */
export function isTypeable(item: VocabItem, direction: Direction): boolean {
  return isSingleWordTarget(field(item, direction === "es-de" ? "de" : "es"));
}

function typeProbability(level: number): number {
  if (level >= 5) return 0.85;
  if (level === 4) return 0.7;
  if (level === 3) return 0.5;
  return 0;
}

/**
 * Decide whether a card is typed: only from level 3 on, only for single-word
 * targets, with a level-rising probability — deterministic from the seed.
 */
export function pickMode(
  level: number,
  item: VocabItem,
  direction: Direction,
  seed: number,
  index: number,
): QuestionMode {
  if (level < TYPE_FROM_LEVEL || !isTypeable(item, direction)) return "choice";
  const rng = mulberry32(seed + index * 40503 + 17);
  return rng() < typeProbability(level) ? "type" : "choice";
}
