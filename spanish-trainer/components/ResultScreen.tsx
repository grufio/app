"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Trophy } from "lucide-react";

export function ResultScreen({
  score,
  highScore,
  isNewBest,
  onRestart,
}: {
  score: number;
  highScore: number;
  isNewBest: boolean;
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
      className="flex flex-col items-center gap-4 rounded-3xl border border-emerald-400/40 bg-slate-900/80 px-8 py-12 text-center shadow-2xl"
    >
      <Trophy className="h-16 w-16 text-emerald-300" aria-hidden />
      <h2 className="text-3xl font-extrabold text-white">¡Muy bien!</h2>
      <p className="text-slate-300">Du hast alle Vokabeln geschafft.</p>
      <p className="text-5xl font-black tabular-nums text-emerald-300">{score}</p>
      <p className="text-sm text-slate-400">
        {isNewBest ? "🎉 Neuer Bestwert!" : `Bestwert: ${highScore}`}
      </p>
      <button
        type="button"
        onClick={onRestart}
        className="mt-3 rounded-full bg-emerald-500 px-8 py-3 text-lg font-bold text-slate-950 transition hover:bg-emerald-400 active:scale-95"
      >
        Nochmal spielen
      </button>
    </motion.div>
  );
}
