"use client";

import { motion } from "framer-motion";
import { PartyPopper } from "lucide-react";

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
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 p-4 backdrop-blur-sm"
      onClick={onContinue}
    >
      <motion.div
        initial={{ scale: 0.8, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 18 }}
        className="flex max-h-[90dvh] flex-col items-center gap-3 overflow-y-auto rounded-3xl border border-line bg-surface px-10 py-8 text-center shadow-[0_10px_40px_rgba(0,0,0,0.12)]"
      >
        <PartyPopper className="h-12 w-12 text-brand" aria-hidden />
        <p className="text-sm uppercase tracking-widest text-ink-soft">Checkpoint</p>
        <p className="text-2xl font-semibold tracking-tight text-ink">Level {level}!</p>
        <button
          type="button"
          onClick={onContinue}
          className="mt-2 rounded-full bg-brand px-6 py-2 font-medium text-white transition hover:bg-brand-hover active:scale-95"
        >
          Weiter
        </button>
      </motion.div>
    </motion.div>
  );
}
