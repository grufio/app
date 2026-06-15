"use client";

import { useReducer } from "react";
import type { VocabItem } from "./types";
import { buildQuestion, pickDirection, pickMode, type Question } from "./choices";
import { mulberry32, randomSeed } from "./rng";
import { comboMultiplier, pointsFor } from "./scoring";
import { buildSessionDeck, loadSrs } from "./srs";
import type { MatchResult } from "./answer-match";

export const MAX_MISTAKES = 5;
export const LEVEL_SIZE = 8;
/** Free hints per session; further hints are gated behind a workout. */
export const FREE_HINTS = 3;

/**
 * Vocabulary trainer engine. Self-paced: answering (multiple-choice click or
 * typed confirmation) grades instantly and the feedback stays on screen.
 * `NEXT`/`PREV` are pure navigation between questions — no auto-advance, no
 * run-ending, no level-up interrupt. The learner resets via `RESTART`.
 */

export type TrainerStatus = "playing" | "answered";

/** A graded answer, kept per deck index so revisiting a question shows its result. */
export interface TrainerAnswerRecord {
  selected: string | null;
  correct: boolean;
  gain: number;
  result: MatchResult;
}

export interface TrainerState {
  /** Full word pool (used to rebuild the deck on restart). */
  pool: VocabItem[];
  deck: VocabItem[];
  index: number;
  question: Question;
  status: TrainerStatus;
  /** Graded answers by deck index — the source of truth for review/navigation. */
  answers: Record<number, TrainerAnswerRecord>;
  /** The option picked for the current index (derived from `answers`). */
  selected: string | null;
  lastCorrect: boolean | null;
  /** Three-way grade of the current answer (typed mode can be "almost"). */
  lastResult: MatchResult | null;
  mistakes: number;
  lives: number;
  score: number;
  /** Points gained on the current answer (drives the popup). */
  lastGain: number;
  streak: number;
  bestStreak: number;
  level: number;
  /** Hints revealed this session; drives the free-hint budget + workout gate. */
  hintsUsed: number;
  seed: number;
}

export type TrainerAction =
  | { type: "ANSWER"; option: string }
  | { type: "ANSWER_TYPED"; result: MatchResult }
  | { type: "NEXT" }
  | { type: "PREV" }
  | { type: "USE_HINT" }
  | { type: "RESTART" };

function levelOf(index: number): number {
  return Math.floor(index / LEVEL_SIZE) + 1;
}

function questionAt(deck: VocabItem[], index: number, seed: number): Question {
  const item = deck[index];
  const rng = mulberry32(seed + index * 2654435761);
  const direction = pickDirection(seed, index);
  const mode = pickMode(levelOf(index), item, direction, seed, index);
  return buildQuestion(item, deck, rng, direction, mode);
}

/** True once every question in the deck has been answered. */
export function isDeckComplete(state: TrainerState): boolean {
  return state.deck.length > 0 && Object.keys(state.answers).length >= state.deck.length;
}

export function createInitialState(
  items: readonly VocabItem[],
  seed: number = randomSeed(),
): TrainerState {
  const pool = items.slice();
  const deck = buildSessionDeck(pool, loadSrs(), mulberry32(seed));
  return {
    pool,
    deck,
    index: 0,
    question: questionAt(deck, 0, seed),
    status: "playing",
    answers: {},
    selected: null,
    lastCorrect: null,
    lastResult: null,
    mistakes: 0,
    lives: MAX_MISTAKES,
    score: 0,
    lastGain: 0,
    streak: 0,
    bestStreak: 0,
    level: 1,
    hintsUsed: 0,
    seed,
  };
}

/** Move the view to `index`, deriving the per-question fields from `answers`. */
function goTo(state: TrainerState, index: number): TrainerState {
  const record = state.answers[index];
  return {
    ...state,
    index,
    question: questionAt(state.deck, index, state.seed),
    status: record ? "answered" : "playing",
    level: levelOf(index),
    selected: record ? record.selected : null,
    lastCorrect: record ? record.correct : null,
    lastResult: record ? record.result : null,
    lastGain: record ? record.gain : 0,
  };
}

/** Apply a graded answer (shared by multiple-choice and typed paths). */
function applyAnswer(
  state: TrainerState,
  result: MatchResult,
  picked: string | null,
): TrainerState {
  const gain = result === "correct" ? pointsFor(state.question.item, state.streak) : 0;
  const record: TrainerAnswerRecord = { selected: picked, correct: result === "correct", gain, result };
  const answers = { ...state.answers, [state.index]: record };
  if (result === "correct") {
    const streak = state.streak + 1;
    return {
      ...state,
      status: "answered",
      answers,
      selected: picked,
      lastResult: "correct",
      lastCorrect: true,
      score: state.score + gain,
      lastGain: gain,
      streak,
      bestStreak: Math.max(state.bestStreak, streak),
    };
  }
  if (result === "almost") {
    // Accepted but imperfect: no life lost, no points, combo resets.
    return {
      ...state,
      status: "answered",
      answers,
      selected: picked,
      lastResult: "almost",
      lastCorrect: false,
      lastGain: 0,
      streak: 0,
    };
  }
  const mistakes = state.mistakes + 1;
  return {
    ...state,
    status: "answered",
    answers,
    selected: picked,
    lastResult: "wrong",
    lastCorrect: false,
    mistakes,
    lives: MAX_MISTAKES - mistakes,
    lastGain: 0,
    streak: 0,
  };
}

export function trainerReducer(
  state: TrainerState,
  action: TrainerAction,
): TrainerState {
  switch (action.type) {
    case "ANSWER": {
      // Grade once; revisiting an already-answered question is a no-op.
      if (state.status !== "playing" || state.answers[state.index]) return state;
      const result = action.option === state.question.answer ? "correct" : "wrong";
      return applyAnswer(state, result, action.option);
    }

    case "ANSWER_TYPED": {
      if (state.status !== "playing" || state.answers[state.index]) return state;
      return applyAnswer(state, action.result, null);
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

    case "USE_HINT":
      return { ...state, hintsUsed: state.hintsUsed + 1 };

    case "RESTART":
      return createInitialState(state.pool, randomSeed());

    default:
      return state;
  }
}

export function useTrainer(items: readonly VocabItem[]) {
  const [state, dispatch] = useReducer(
    trainerReducer,
    items,
    (init) => createInitialState(init),
  );

  return { state, dispatch, multiplier: comboMultiplier(state.streak) };
}
