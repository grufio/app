"use client";

import { motion } from "framer-motion";

export function LevelUpToast({
  level,
  onContinue,
}: {
  level: number;
  onContinue: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm"
      onClick={onContinue}
    >
      <motion.div
        initial={{ scale: 0.7, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 18 }}
        className="flex flex-col items-center gap-3 rounded-3xl border border-indigo-400/40 bg-slate-900 px-10 py-8 text-center shadow-2xl"
      >
        <span className="text-5xl">🎉</span>
        <p className="text-sm uppercase tracking-widest text-indigo-300">Checkpoint</p>
        <p className="text-2xl font-extrabold text-white">Level {level}!</p>
        <button
          type="button"
          onClick={onContinue}
          className="mt-2 rounded-full bg-indigo-500 px-6 py-2 font-semibold text-white transition hover:bg-indigo-400 active:scale-95"
        >
          Weiter
        </button>
      </motion.div>
    </motion.div>
  );
}
