"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, MotionConfig } from "framer-motion";

import type { PhysikTest } from "@/lib/physik-tests";
import { useMcTrainer } from "@/lib/useMcTrainer";
import { loadHighScore, loadSrs, recordResult, saveHighScore, saveSrs } from "@/lib/physik/store";
import { playCue, setMuted } from "@/lib/sfx";

import { ScoreBar } from "@/components/ScoreBar";
import { Lives } from "@/components/Lives";
import { ComboMeter } from "@/components/ComboMeter";
import { SettingsToggle } from "@/components/SettingsToggle";
import { StemCard } from "@/components/StemCard";
import { AnswerOptions } from "@/components/AnswerOptions";
import { LevelUpToast } from "@/components/LevelUpToast";
import { ResultScreen } from "@/components/ResultScreen";
import { RestartScreen } from "@/components/RestartScreen";

export function McPlay({ test }: { test: PhysikTest }) {
  const { state, dispatch, multiplier } = useMcTrainer(test.items);

  const [soundOn, setSoundOn] = useState(true);
  const [animationsOn, setAnimationsOn] = useState(true);
  const [highScore, setHighScore] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);
  const [mounted, setMounted] = useState(false);
  const finishedRef = useRef<number | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => setHighScore(loadHighScore().score), []);
  useEffect(() => setMuted(!soundOn), [soundOn]);

  // Sound cues + SRS / high-score persistence on status transitions.
  useEffect(() => {
    if (state.status === "answered") {
      playCue(state.lastCorrect ? "correct" : "wrong");
      saveSrs(
        recordResult(
          loadSrs(),
          state.question.item.id,
          state.lastCorrect ? "correct" : "wrong",
        ),
      );
    } else if (state.status === "levelup") {
      playCue("levelup");
    } else if (state.status === "won" || state.status === "gameover") {
      if (finishedRef.current !== state.seed) {
        finishedRef.current = state.seed;
        if (state.status === "won") playCue("win");
        const previous = loadHighScore().score;
        const best = saveHighScore({ score: state.score, level: state.level });
        setIsNewBest(state.score > previous && state.score > 0);
        setHighScore(best.score);
      }
    } else if (state.status === "playing" && state.index === 0) {
      finishedRef.current = null;
      setIsNewBest(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.index]);

  const { question } = state;

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
            <Link href="/physik/tests" className="text-sm font-medium text-brand">
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

        <div className="relative mt-3 flex flex-1 flex-col">
          {state.status === "won" ? (
            <div className="flex flex-1 items-center justify-center">
              <ResultScreen
                score={state.score}
                highScore={highScore}
                isNewBest={isNewBest}
                subtitle="Du hast alle Fragen geschafft."
                onRestart={() => dispatch({ type: "RESTART" })}
              />
            </div>
          ) : state.status === "gameover" ? (
            <div className="flex flex-1 items-center justify-center">
              <RestartScreen
                score={state.score}
                onRestart={() => dispatch({ type: "RESTART" })}
              />
            </div>
          ) : (
            <div className="flex flex-1 flex-col justify-between gap-3">
              <AnimatePresence mode="wait">
                <StemCard
                  key={question.item.id + state.index}
                  id={question.item.id + state.index}
                  stem={question.stem}
                  topic={question.item.topic}
                  answered={state.status === "answered"}
                  lastCorrect={state.lastCorrect}
                  lastGain={state.lastGain}
                />
              </AnimatePresence>

              <AnswerOptions
                options={question.options}
                answer={question.answer}
                selected={state.selected}
                answered={state.status === "answered"}
                onSelect={(option) => dispatch({ type: "ANSWER", option })}
              />
            </div>
          )}

          <AnimatePresence>
            {state.status === "levelup" && (
              <LevelUpToast
                level={state.level}
                onContinue={() => dispatch({ type: "DISMISS_LEVELUP" })}
              />
            )}
          </AnimatePresence>
        </div>
      </main>
    </MotionConfig>
  );
}
