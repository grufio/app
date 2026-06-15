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
 * typed confirmation) grades instantly and the feedback stays on screen — there
 * is no auto-advance. `NEXT`/`PREV` move between questions manually; level-up
 * checkpoints are an interstitial you page through, the result screen waits at
 * the end, and a 5th mistake raises the game-over dialog immediately. The
 * learner resets via `RESTART`.
 */

export type TrainerStatus =
  | "playing"
  | "answered"
  | "levelup"
  | "won"
  | "gameover";

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

/** A level boundary sits before every index that starts a new level (8, 16, …). */
function isLevelBoundary(index: number): boolean {
  return index > 0 && index % LEVEL_SIZE === 0;
}

function questionAt(deck: VocabItem[], index: number, seed: number): Question {
  const item = deck[index];
  const rng = mulberry32(seed + index * 2654435761);
  const direction = pickDirection(seed, index);
  const mode = pickMode(levelOf(index), item, direction, seed, index);
  return buildQuestion(item, deck, rng, direction, mode);
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

/** Show the question at `index`, deriving the per-question fields from `answers`. */
function goToQuestion(state: TrainerState, index: number): TrainerState {
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

/** Park on the level-up interstitial that precedes the current `index`. */
function goToLevelGate(state: TrainerState): TrainerState {
  return {
    ...state,
    status: "levelup",
    selected: null,
    lastCorrect: null,
    lastResult: null,
    lastGain: 0,
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

function graded(state: TrainerState, next: TrainerState): TrainerState {
  // A 5th mistake raises the game-over dialog right away.
  return next.mistakes >= MAX_MISTAKES ? { ...next, status: "gameover" } : next;
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
      return graded(state, applyAnswer(state, result, action.option));
    }

    case "ANSWER_TYPED": {
      if (state.status !== "playing" || state.answers[state.index]) return state;
      return graded(state, applyAnswer(state, action.result, null));
    }

    case "NEXT": {
      // From the level-up interstitial, Weiter enters the level's first question.
      if (state.status === "levelup") return goToQuestion(state, state.index);
      // Only a graded question advances (the UI keeps Weiter disabled otherwise);
      // won / gameover are terminal.
      if (state.status !== "answered") return state;
      const next = state.index + 1;
      if (next >= state.deck.length) return { ...state, status: "won" };
      if (isLevelBoundary(next)) {
        return goToLevelGate({
          ...state,
          index: next,
          question: questionAt(state.deck, next, state.seed),
          level: levelOf(next),
        });
      }
      return goToQuestion(state, next);
    }

    case "PREV": {
      if (state.status === "won") return goToQuestion(state, state.deck.length - 1);
      if (state.status === "gameover") return state;
      if (state.status === "levelup") return goToQuestion(state, state.index - 1);
      if (state.index <= 0) return state;
      // Crossing a boundary backwards stops on the interstitial first.
      if (isLevelBoundary(state.index)) return goToLevelGate(state);
      return goToQuestion(state, state.index - 1);
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
