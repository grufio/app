"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig } from "framer-motion";

import { unidad5 } from "@/data/unidad5";
import { useTrainer } from "@/lib/useTrainer";
import { loadHighScore, saveHighScore } from "@/lib/scoring";
import { playCue, setMuted } from "@/lib/sfx";

import { ScoreBar } from "@/components/ScoreBar";
import { Lives } from "@/components/Lives";
import { ComboMeter } from "@/components/ComboMeter";
import { SettingsToggle } from "@/components/SettingsToggle";
import { VocabCard } from "@/components/VocabCard";
import { AnswerOptions } from "@/components/AnswerOptions";
import { HintPanel } from "@/components/HintPanel";
import { LevelUpToast } from "@/components/LevelUpToast";
import { ResultScreen } from "@/components/ResultScreen";
import { RestartScreen } from "@/components/RestartScreen";

export default function Home() {
  const { state, dispatch, multiplier } = useTrainer(unidad5);

  const [soundOn, setSoundOn] = useState(true);
  const [animationsOn, setAnimationsOn] = useState(true);
  const [highScore, setHighScore] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);
  const finishedRef = useRef<number | null>(null);

  useEffect(() => setHighScore(loadHighScore().score), []);
  useEffect(() => setMuted(!soundOn), [soundOn]);

  // Sound cues + high-score persistence on status transitions.
  useEffect(() => {
    if (state.status === "answered") {
      playCue(state.lastCorrect ? "correct" : "wrong");
    } else if (state.status === "levelup") {
      playCue("levelup");
    } else if (state.status === "won" || state.status === "gameover") {
      // Guard so we only finalise a given run once.
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

  return (
    <MotionConfig reducedMotion={animationsOn ? "user" : "always"}>
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 pb-10 pt-5">
        <header className="flex flex-col gap-3">
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

        <div className="relative mt-4 flex flex-1 flex-col">
          {state.status === "won" ? (
            <div className="flex flex-1 items-center justify-center">
              <ResultScreen
                score={state.score}
                highScore={highScore}
                isNewBest={isNewBest}
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
            <div className="flex flex-1 flex-col gap-6">
              <AnimatePresence mode="wait">
                <VocabCard
                  key={question.item.id + state.index}
                  question={question}
                  answered={state.status === "answered"}
                  lastCorrect={state.lastCorrect}
                  lastGain={state.lastGain}
                />
              </AnimatePresence>

              <HintPanel item={question.item} direction={question.direction} />

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
