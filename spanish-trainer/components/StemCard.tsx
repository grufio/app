"use client";

import { AnimatePresence, motion } from "framer-motion";

/**
 * Question card for the multiple-choice physics tests — the MC counterpart of
 * VocabCard. Shows the topic pill and the question stem (no speaker, no
 * translation direction). Same card styling for visual consistency.
 */
export function StemCard({
  id,
  stem,
  topic,
  answered,
  lastCorrect,
  lastGain,
}: {
  id: string;
  stem: string;
  topic: string;
  answered: boolean;
  lastCorrect: boolean | null;
  lastGain: number;
}) {
  return (
    <motion.div
      key={id}
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className="relative flex w-full flex-col items-center gap-4 rounded-3xl border border-line bg-surface px-6 py-6 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]"
    >
      <span className="rounded-full bg-canvas px-3 py-1 text-xs font-medium uppercase tracking-wide text-ink-soft">
        {topic}
      </span>

      <h1 className="text-center font-semibold leading-tight tracking-tight text-ink text-[clamp(1.25rem,5vw,1.75rem)]">
        {stem}
      </h1>

      <AnimatePresence>
        {answered && lastCorrect && lastGain > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 0, scale: 0.8 }}
            animate={{ opacity: 1, y: -28, scale: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute right-6 top-8 text-2xl font-bold text-ok"
          >
            +{lastGain}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
