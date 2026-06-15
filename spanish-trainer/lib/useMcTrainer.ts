"use client";

import { useReducer } from "react";
import { buildMcDeck, buildMcQuestion, type McItem, type McQuestion } from "./mc";
import { mulberry32, randomSeed } from "./rng";
import { BASE_POINTS, comboMultiplier } from "./scoring";
import { loadSrs } from "./srs";

/**
 * Multiple-choice trainer engine. A deliberately separate, slimmer mirror of
 * `useTrainer` (the vocabulary engine): no typed mode, no hints, no direction —
 * just curated multiple-choice questions. The deck is random but puts the
 * least-known questions first (`buildMcDeck`).
 *
 * Self-paced flow: answering grades instantly (score / combo / lives update on
 * the click) and the feedback stays on screen. `NEXT`/`PREV` are pure navigation
 * between questions — they never auto-advance, end the run, or interrupt with a
 * level-up. The learner resets the deck themselves via `RESTART`.
 */

export const MAX_MISTAKES = 5;
export const LEVEL_SIZE = 8;

export type McTrainerStatus = "playing" | "answered";

/** A graded answer, kept per deck index so revisiting a question shows its result. */
export interface McAnswerRecord {
  selected: string;
  correct: boolean;
  gain: number;
}

export interface McTrainerState {
  /** Full question pool (used to rebuild the deck on restart). */
  pool: McItem[];
  deck: McItem[];
  index: number;
  question: McQuestion;
  status: McTrainerStatus;
  /** Graded answers by deck index — the source of truth for review/navigation. */
  answers: Record<number, McAnswerRecord>;
  /** The option picked for the current index (derived from `answers`). */
  selected: string | null;
  lastCorrect: boolean | null;
  mistakes: number;
  lives: number;
  score: number;
  /** Points gained on the current answer (drives the popup). */
  lastGain: number;
  streak: number;
  bestStreak: number;
  level: number;
  seed: number;
}

export type McTrainerAction =
  | { type: "ANSWER"; option: string }
  | { type: "NEXT" }
  | { type: "PREV" }
  | { type: "RESTART" };

function levelOf(index: number): number {
  return Math.floor(index / LEVEL_SIZE) + 1;
}

function questionAt(deck: McItem[], index: number, seed: number): McQuestion {
  return buildMcQuestion(deck[index], mulberry32(seed + index * 2654435761));
}

/** True once every question in the deck has been answered. */
export function isDeckComplete(state: McTrainerState): boolean {
  return state.deck.length > 0 && Object.keys(state.answers).length >= state.deck.length;
}

export function createInitialState(
  items: readonly McItem[],
  seed: number = randomSeed(),
): McTrainerState {
  const pool = items.slice();
  const deck = buildMcDeck(pool, loadSrs(), mulberry32(seed));
  return {
    pool,
    deck,
    index: 0,
    question: questionAt(deck, 0, seed),
    status: "playing",
    answers: {},
    selected: null,
    lastCorrect: null,
    mistakes: 0,
    lives: MAX_MISTAKES,
    score: 0,
    lastGain: 0,
    streak: 0,
    bestStreak: 0,
    level: 1,
    seed,
  };
}

/** Move the view to `index`, deriving the per-question fields from `answers`. */
function goTo(state: McTrainerState, index: number): McTrainerState {
  const record = state.answers[index];
  return {
    ...state,
    index,
    question: questionAt(state.deck, index, state.seed),
    status: record ? "answered" : "playing",
    level: levelOf(index),
    selected: record ? record.selected : null,
    lastCorrect: record ? record.correct : null,
    lastGain: record ? record.gain : 0,
  };
}

function applyAnswer(
  state: McTrainerState,
  correct: boolean,
  picked: string,
): McTrainerState {
  const gain = correct ? Math.round(BASE_POINTS * comboMultiplier(state.streak)) : 0;
  const record: McAnswerRecord = { selected: picked, correct, gain };
  const answers = { ...state.answers, [state.index]: record };
  if (correct) {
    const streak = state.streak + 1;
    return {
      ...state,
      status: "answered",
      answers,
      selected: picked,
      lastCorrect: true,
      score: state.score + gain,
      lastGain: gain,
      streak,
      bestStreak: Math.max(state.bestStreak, streak),
    };
  }
  const mistakes = state.mistakes + 1;
  return {
    ...state,
    status: "answered",
    answers,
    selected: picked,
    lastCorrect: false,
    mistakes,
    lives: MAX_MISTAKES - mistakes,
    lastGain: 0,
    streak: 0,
  };
}

export function mcTrainerReducer(
  state: McTrainerState,
  action: McTrainerAction,
): McTrainerState {
  switch (action.type) {
    case "ANSWER": {
      // Grade once; revisiting an already-answered question is a no-op.
      if (state.status !== "playing" || state.answers[state.index]) return state;
      return applyAnswer(state, action.option === state.question.answer, action.option);
    }

    case "NEXT": {
      // Pure navigation — never advances on its own, ends the run, or levels up.
      if (state.index + 1 >= state.deck.length) return state;
      return goTo(state, state.index + 1);
    }

    case "PREV": {
      if (state.index <= 0) return state;
      return goTo(state, state.index - 1);
    }

    case "RESTART":
      return createInitialState(state.pool, randomSeed());

    default:
      return state;
  }
}

export function useMcTrainer(items: readonly McItem[]) {
  const [state, dispatch] = useReducer(
    mcTrainerReducer,
    items,
    (init) => createInitialState(init),
  );

  return { state, dispatch, multiplier: comboMultiplier(state.streak) };
}
