"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, MotionConfig } from "framer-motion";

import type { TestDef } from "@/lib/tests";
import { FREE_HINTS, isDeckComplete, useTrainer } from "@/lib/useTrainer";
import { loadHighScore, saveHighScore } from "@/lib/scoring";
import { loadSrs, recordResult, saveSrs } from "@/lib/srs";
import { appendRun } from "@/lib/stats";
import { getActiveUser } from "@/lib/user";
import { playCue, setMuted } from "@/lib/sfx";

import { ScoreBar } from "@/components/ScoreBar";
import { Lives } from "@/components/Lives";
import { ComboMeter } from "@/components/ComboMeter";
import { SettingsToggle } from "@/components/SettingsToggle";
import { VocabCard } from "@/components/VocabCard";
import { AnswerOptions } from "@/components/AnswerOptions";
import { HintPanel } from "@/components/HintPanel";
import { NavControls } from "@/components/NavControls";
import { WorkoutGate } from "@/components/WorkoutGate";
import { TypeInput } from "@/components/TypeInput";

export function VocabPlay({ test }: { test: Extract<TestDef, { kind: "vocab" }> }) {
  const { state, dispatch, multiplier } = useTrainer(test.items);

  const [soundOn, setSoundOn] = useState(true);
  const [animationsOn, setAnimationsOn] = useState(true);
  const [highScore, setHighScore] = useState(0);
  const [mounted, setMounted] = useState(false);
  // Indices whose answer we've already recorded (SRS + sound) — so paging back
  // and forth over a question doesn't replay the cue or double-count it.
  const recordedRef = useRef<Set<number>>(new Set());
  const finishedRef = useRef<number | null>(null);

  // Hint budget: first FREE_HINTS per session are free, then a workout gate.
  const [gateOpen, setGateOpen] = useState(false);
  const pendingRevealRef = useRef<(() => void) | null>(null);
  const freeLeft = Math.max(0, FREE_HINTS - state.hintsUsed);

  function requestHint(reveal: () => void) {
    if (state.hintsUsed < FREE_HINTS) {
      dispatch({ type: "USE_HINT" });
      reveal();
    } else {
      pendingRevealRef.current = reveal;
      setGateOpen(true);
    }
  }

  function completeWorkout() {
    dispatch({ type: "USE_HINT" });
    pendingRevealRef.current?.();
    pendingRevealRef.current = null;
    setGateOpen(false);
  }

  function cancelWorkout() {
    pendingRevealRef.current = null;
    setGateOpen(false);
  }

  useEffect(() => setMounted(true), []);
  useEffect(() => setHighScore(loadHighScore().score), []);
  useEffect(() => setMuted(!soundOn), [soundOn]);

  // A fresh run (RESTART → new seed) clears the per-run guards.
  useEffect(() => {
    recordedRef.current = new Set();
    finishedRef.current = null;
  }, [state.seed]);

  // Instant feedback side-effects: record the result + play the cue exactly once,
  // the first time a given question is answered.
  useEffect(() => {
    if (state.status !== "answered" || state.lastResult === null) return;
    if (recordedRef.current.has(state.index)) return;
    recordedRef.current.add(state.index);
    playCue(state.lastCorrect ? "correct" : "wrong");
    saveSrs(recordResult(loadSrs(), state.question.item.id, state.lastResult));
  }, [state.status, state.index, state.lastCorrect, state.lastResult, state.question.item.id]);

  // Persist the run + high score once, when the whole deck has been answered.
  useEffect(() => {
    if (!isDeckComplete(state) || finishedRef.current === state.seed) return;
    finishedRef.current = state.seed;
    playCue("win");
    const best = saveHighScore({ score: state.score, level: state.level });
    setHighScore(best.score);
    appendRun({
      user: getActiveUser(),
      testId: test.id,
      at: Date.now(),
      score: state.score,
      total: state.deck.length,
      outcome: "won",
    });
  }, [state, test.id]);

  const { question } = state;
  const answered = state.status === "answered";
  const complete = isDeckComplete(state);

  if (!mounted) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-ink-soft">
        Lädt…
      </main>
    );
  }

  return (
    <MotionConfig reducedMotion={animationsOn ? "user" : "always"}>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Link href="/tests" className="text-sm font-medium text-brand">
              ‹ Tests
            </Link>
            <span className="text-sm text-ink-soft">{test.title}</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <Lives lives={state.lives} />
            <SettingsToggle
              soundOn={soundOn}
              animationsOn={animationsOn}
              onToggleSound={() => setSoundOn((v) => !v)}
              onToggleAnimations={() => setAnimationsOn((v) => !v)}
            />
          </div>
          <ScoreBar
            score={state.score}
            level={state.level}
            index={state.index}
            total={state.deck.length}
            highScore={highScore}
          />
          <div className="flex justify-center">
            <ComboMeter streak={state.streak} multiplier={multiplier} />
          </div>
        </header>

        <div className="relative mt-3 flex flex-1 flex-col justify-between gap-3">
          <div className="flex flex-col gap-3">
            <AnimatePresence mode="wait">
              <VocabCard
                key={question.item.id + state.index}
                question={question}
                answered={answered}
                lastCorrect={state.lastCorrect}
                lastGain={state.lastGain}
              />
            </AnimatePresence>

            <HintPanel
              item={question.item}
              direction={question.direction}
              freeLeft={freeLeft}
              onHintRequest={requestHint}
            />

            {question.mode === "type" ? (
              <TypeInput
                key={question.item.id + state.index}
                answer={question.answer}
                direction={question.direction}
                answeredResult={answered ? state.lastResult : null}
                onResult={(result) => dispatch({ type: "ANSWER_TYPED", result })}
              />
            ) : (
              <AnswerOptions
                options={question.options}
                answer={question.answer}
                selected={state.selected}
                answered={answered}
                onSelect={(option) => dispatch({ type: "ANSWER", option })}
              />
            )}

            {complete && (
              <p className="text-center text-sm font-medium text-ink-soft">
                Fertig — {state.score} Punkte. Mit „Zurück“ durchsehen oder den Test zurücksetzen.
              </p>
            )}
          </div>

          <NavControls
            canPrev={state.index > 0}
            canNext={answered && state.index < state.deck.length - 1}
            onPrev={() => dispatch({ type: "PREV" })}
            onNext={() => dispatch({ type: "NEXT" })}
            onReset={() => dispatch({ type: "RESTART" })}
          />

          <AnimatePresence>
            {gateOpen && (
              <WorkoutGate onComplete={completeWorkout} onCancel={cancelWorkout} />
            )}
          </AnimatePresence>
        </div>
      </main>
    </MotionConfig>
  );
}
