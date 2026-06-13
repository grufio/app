"use client";

import { motion } from "framer-motion";
import { RotateCcw } from "lucide-react";

export function RestartScreen({
  score,
  onRestart,
}: {
  score: number;
  onRestart: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-4 rounded-3xl border border-rose-400/40 bg-slate-900/80 px-8 py-12 text-center shadow-2xl"
    >
      <RotateCcw className="h-16 w-16 text-rose-300" aria-hidden />
      <h2 className="text-3xl font-extrabold text-white">Nochmal!</h2>
      <p className="max-w-xs text-slate-300">
        5 Fehler — kein Problem. Die Reihenfolge wird neu gemischt, dann geht es
        von vorne los.
      </p>
      <p className="text-sm text-slate-400 tabular-nums">Punkte: {score}</p>
      <button
        type="button"
        onClick={onRestart}
        className="mt-3 rounded-full bg-rose-500 px-8 py-3 text-lg font-bold text-white transition hover:bg-rose-400 active:scale-95"
      >
        Neu starten
      </button>
    </motion.div>
  );
}
