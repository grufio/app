"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Trophy } from "lucide-react";

export function ResultScreen({
  score,
  highScore,
  isNewBest,
  subtitle = "Du hast alle Vokabeln geschafft.",
  onRestart,
}: {
  score: number;
  highScore: number;
  isNewBest: boolean;
  subtitle?: string;
  onRestart: () => void;
}) {
  useEffect(() => {
    const end = Date.now() + 900;
    const tick = () => {
      confetti({
        particleCount: 4,
        spread: 70,
        origin: { y: 0.6 },
        startVelocity: 35,
      });
      if (Date.now() < end) requestAnimationFrame(tick);
    };
    tick();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex max-h-[90dvh] flex-col items-center gap-4 overflow-y-auto rounded-3xl border border-line bg-surface px-8 py-10 text-center shadow-[0_10px_40px_rgba(0,0,0,0.12)]"
    >
      <Trophy className="h-16 w-16 text-ok" aria-hidden />
      <h2 className="text-3xl font-semibold tracking-tight text-ink">¡Muy bien!</h2>
      <p className="text-ink-soft">{subtitle}</p>
      <p className="text-5xl font-semibold tabular-nums text-ink">{score}</p>
      <p className="text-sm text-ink-soft">
        {isNewBest ? (
          <span className="font-medium text-brand">Neuer Bestwert!</span>
        ) : (
          `Bestwert: ${highScore}`
        )}
      </p>
      <button
        type="button"
        onClick={onRestart}
        className="mt-3 rounded-full bg-brand px-8 py-3 text-[17px] font-medium text-white transition hover:bg-brand-hover active:scale-95"
      >
        Nochmal spielen
      </button>
    </motion.div>
  );
}
