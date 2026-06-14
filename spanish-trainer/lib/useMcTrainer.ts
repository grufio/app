"use client";

import { useEffect, useReducer } from "react";
import { buildMcDeck, buildMcQuestion, type McItem, type McQuestion } from "./mc";
import { mulberry32, randomSeed } from "./rng";
import { BASE_POINTS, comboMultiplier } from "./scoring";
import { loadSrs } from "./srs";

/**
 * Multiple-choice trainer engine. A deliberately separate, slimmer mirror of
 * `useTrainer` (the vocabulary engine): no typed mode, no hints, no direction —
 * just curated multiple-choice questions. The deck is random but puts the
 * least-known questions first (`buildMcDeck`). It reuses the generic scoring and
 * PRNG and keeps the same status machine so the shared UI chrome (ScoreBar,
 * Lives, level-up, result/restart screens) works as-is.
 */

export const MAX_MISTAKES = 5;
export const LEVEL_SIZE = 8;

export type McTrainerStatus =
  | "playing"
  | "answered"
  | "levelup"
  | "won"
  | "gameover";

export interface McTrainerState {
  /** Full question pool (used to rebuild the deck on restart). */
  pool: McItem[];
  deck: McItem[];
  index: number;
  question: McQuestion;
  status: McTrainerStatus;
  /** The option the learner last picked (for highlighting). */
  selected: string | null;
  lastCorrect: boolean | null;
  mistakes: number;
  lives: number;
  score: number;
  /** Points gained on the last correct answer (drives the popup). */
  lastGain: number;
  streak: number;
  bestStreak: number;
  level: number;
  seed: number;
}

export type McTrainerAction =
  | { type: "ANSWER"; option: string }
  | { type: "NEXT" }
  | { type: "DISMISS_LEVELUP" }
  | { type: "RESTART" };

function levelOf(index: number): number {
  return Math.floor(index / LEVEL_SIZE) + 1;
}

function questionAt(deck: McItem[], index: number, seed: number): McQuestion {
  return buildMcQuestion(deck[index], mulberry32(seed + index * 2654435761));
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

function applyAnswer(
  state: McTrainerState,
  correct: boolean,
  picked: string,
): McTrainerState {
  if (correct) {
    const gain = Math.round(BASE_POINTS * comboMultiplier(state.streak));
    const streak = state.streak + 1;
    return {
      ...state,
      status: "answered",
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
      if (state.status !== "playing") return state;
      return applyAnswer(state, action.option === state.question.answer, action.option);
    }

    case "NEXT": {
      if (state.status !== "answered") return state;
      if (state.mistakes >= MAX_MISTAKES) {
        return { ...state, status: "gameover", selected: null };
      }
      const nextIndex = state.index + 1;
      if (nextIndex >= state.deck.length) {
        return { ...state, status: "won", selected: null };
      }
      const crossedLevel = levelOf(nextIndex) > levelOf(state.index);
      return {
        ...state,
        index: nextIndex,
        question: questionAt(state.deck, nextIndex, state.seed),
        status: crossedLevel ? "levelup" : "playing",
        selected: null,
        lastCorrect: null,
        level: levelOf(nextIndex),
      };
    }

    case "DISMISS_LEVELUP": {
      if (state.status !== "levelup") return state;
      return { ...state, status: "playing" };
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

  // Auto-advance after showing feedback: quick on correct, a touch longer on a
  // mistake so the correct option can be read.
  useEffect(() => {
    if (state.status !== "answered") return;
    const delay = state.lastCorrect ? 750 : 1400;
    const timer = setTimeout(() => dispatch({ type: "NEXT" }), delay);
    return () => clearTimeout(timer);
  }, [state.status, state.lastCorrect, state.index]);

  return { state, dispatch, multiplier: comboMultiplier(state.streak) };
}
