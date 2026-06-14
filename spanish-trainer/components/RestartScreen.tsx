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
      className="flex max-h-[90dvh] flex-col items-center gap-4 overflow-y-auto rounded-3xl border border-line bg-surface px-8 py-10 text-center shadow-[0_10px_40px_rgba(0,0,0,0.12)]"
    >
      <RotateCcw className="h-16 w-16 text-brand" aria-hidden />
      <h2 className="text-3xl font-semibold tracking-tight text-ink">Nochmal!</h2>
      <p className="max-w-xs text-ink-soft">
        5 Fehler — kein Problem. Die Reihenfolge wird neu gemischt, dann geht es
        von vorne los.
      </p>
      <p className="text-sm text-ink-soft tabular-nums">Punkte: {score}</p>
      <button
        type="button"
        onClick={onRestart}
        className="mt-3 rounded-full bg-brand px-8 py-3 text-[17px] font-medium text-white transition hover:bg-brand-hover active:scale-95"
      >
        Neu starten
      </button>
    </motion.div>
  );
}
