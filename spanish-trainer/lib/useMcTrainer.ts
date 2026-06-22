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
 * the click) and the feedback stays on screen — there is no auto-advance.
 * `NEXT`/`PREV` move between questions manually; level-up checkpoints are an
 * interstitial you page through, the result screen waits at the end, and a 5th
 * mistake raises the game-over dialog immediately. The learner resets via
 * `RESTART`.
 */

export const MAX_MISTAKES = 5;
export const LEVEL_SIZE = 8;

export type McTrainerStatus =
  | "explain"
  | "playing"
  | "answered"
  | "levelup"
  | "won"
  | "gameover";

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
  | { type: "REVEAL" }
  | { type: "SKIP" }
  | { type: "NEXT" }
  | { type: "PREV" }
  | { type: "RESTART" };

function levelOf(index: number): number {
  return Math.floor(index / LEVEL_SIZE) + 1;
}

/** A level boundary sits before every index that starts a new level (8, 16, …). */
function isLevelBoundary(index: number): boolean {
  return index > 0 && index % LEVEL_SIZE === 0;
}

function questionAt(deck: McItem[], index: number, seed: number): McQuestion {
  return buildMcQuestion(deck[index], mulberry32(seed + index * 2654435761));
}

/**
 * A brand-new (unanswered) question opens on its explanation page when the
 * item carries one ("explain"), otherwise straight on the question ("playing").
 * Items without an explanation (e.g. Deutsch) therefore behave exactly as before.
 */
function freshStatus(deck: McItem[], index: number): McTrainerStatus {
  return deck[index]?.explanation ? "explain" : "playing";
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
    status: freshStatus(deck, 0),
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

/** Show the question at `index`, deriving the per-question fields from `answers`. */
function goToQuestion(state: McTrainerState, index: number): McTrainerState {
  const record = state.answers[index];
  return {
    ...state,
    index,
    question: questionAt(state.deck, index, state.seed),
    status: record ? "answered" : freshStatus(state.deck, index),
    level: levelOf(index),
    selected: record ? record.selected : null,
    lastCorrect: record ? record.correct : null,
    lastGain: record ? record.gain : 0,
  };
}

/** Park on the level-up interstitial that precedes the current `index`. */
function goToLevelGate(state: McTrainerState): McTrainerState {
  return { ...state, status: "levelup", selected: null, lastCorrect: null, lastGain: 0 };
}

/**
 * Move forward from `index` to the next question — ending the run (won), parking
 * on a level gate, or landing on the next question. Shared by NEXT (after an
 * answer) and SKIP (leaving an unanswered question untouched).
 */
function advanceFrom(state: McTrainerState, index: number): McTrainerState {
  const next = index + 1;
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
      const graded = applyAnswer(state, action.option === state.question.answer, action.option);
      // A 5th mistake raises the game-over dialog right away.
      return graded.mistakes >= MAX_MISTAKES ? { ...graded, status: "gameover" } : graded;
    }

    case "REVEAL": {
      // Leave the explanation page and reveal the question itself.
      return state.status === "explain" ? { ...state, status: "playing" } : state;
    }

    case "SKIP": {
      // Skip past an unanswered question without grading it (offered by the UI
      // only for questions already mastered in earlier sessions). No score,
      // streak or life change — just move on.
      if (state.status !== "playing") return state;
      return advanceFrom(state, state.index);
    }

    case "NEXT": {
      // From the level-up interstitial, Weiter enters the level's first question.
      if (state.status === "levelup") return goToQuestion(state, state.index);
      // Only a graded question advances (the UI keeps Weiter disabled otherwise);
      // won / gameover are terminal.
      if (state.status !== "answered") return state;
      return advanceFrom(state, state.index);
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
