"use client";

import { useEffect, useReducer } from "react";
import type { VocabItem } from "./types";
import { buildQuestion, pickDirection, type Question } from "./choices";
import { mulberry32, randomSeed, shuffle } from "./rng";
import { comboMultiplier, pointsFor } from "./scoring";

export const MAX_MISTAKES = 5;
export const LEVEL_SIZE = 8;
/** Free hints per session; further hints are gated behind a workout. */
export const FREE_HINTS = 3;

export type TrainerStatus =
  | "playing"
  | "answered"
  | "levelup"
  | "won"
  | "gameover";

export interface TrainerState {
  deck: VocabItem[];
  index: number;
  question: Question;
  status: TrainerStatus;
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
  /** Hints revealed this session; drives the free-hint budget + workout gate. */
  hintsUsed: number;
  seed: number;
}

export type TrainerAction =
  | { type: "ANSWER"; option: string }
  | { type: "NEXT" }
  | { type: "DISMISS_LEVELUP" }
  | { type: "USE_HINT" }
  | { type: "RESTART" };

function levelOf(index: number): number {
  return Math.floor(index / LEVEL_SIZE) + 1;
}

function questionAt(deck: VocabItem[], index: number, seed: number): Question {
  const item = deck[index];
  const rng = mulberry32(seed + index * 2654435761);
  return buildQuestion(item, deck, rng, pickDirection(seed, index));
}

export function createInitialState(
  items: readonly VocabItem[],
  seed: number = randomSeed(),
): TrainerState {
  const deck = shuffle(items, mulberry32(seed));
  return {
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
    hintsUsed: 0,
    seed,
  };
}

export function trainerReducer(
  state: TrainerState,
  action: TrainerAction,
): TrainerState {
  switch (action.type) {
    case "ANSWER": {
      if (state.status !== "playing") return state;
      const correct = action.option === state.question.answer;
      if (correct) {
        const gain = pointsFor(state.question.item, state.streak);
        const streak = state.streak + 1;
        return {
          ...state,
          status: "answered",
          selected: action.option,
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
        selected: action.option,
        lastCorrect: false,
        mistakes,
        lives: MAX_MISTAKES - mistakes,
        lastGain: 0,
        streak: 0,
      };
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

    case "USE_HINT":
      return { ...state, hintsUsed: state.hintsUsed + 1 };

    case "RESTART":
      return createInitialState(state.deck, randomSeed());

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

  // Auto-advance after showing feedback: quick on correct, a touch longer on
  // a mistake so the correct answer can be read.
  useEffect(() => {
    if (state.status !== "answered") return;
    const delay = state.lastCorrect ? 750 : 1400;
    const timer = setTimeout(() => dispatch({ type: "NEXT" }), delay);
    return () => clearTimeout(timer);
  }, [state.status, state.lastCorrect, state.index]);

  return { state, dispatch, multiplier: comboMultiplier(state.streak) };
}
