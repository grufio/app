"use client";

import { motion } from "framer-motion";
import { Lightbulb } from "lucide-react";

/**
 * Explanation page shown *before* a question (Physik). Presents a short,
 * age-appropriate explanation of the relevant content; "Weiter" then reveals
 * the question. Styled like the other full-screen steps (LevelUpToast / result).
 */
export function ExplainScreen({
  text,
  onReveal,
}: {
  text: string;
  onReveal: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 18 }}
      className="flex max-h-[80dvh] flex-col items-center gap-4 overflow-y-auto rounded-3xl border border-line bg-surface px-8 py-9 text-center shadow-[0_10px_40px_rgba(0,0,0,0.08)]"
    >
      <Lightbulb className="h-11 w-11 text-brand" aria-hidden />
      <p className="text-sm uppercase tracking-widest text-ink-soft">Gut zu wissen</p>
      <p className="text-[17px] leading-relaxed text-ink">{text}</p>
      <button
        type="button"
        onClick={onReveal}
        className="mt-2 rounded-full bg-brand px-8 py-3 text-[17px] font-medium text-white transition hover:bg-brand-hover active:scale-95"
      >
        Weiter ›
      </button>
    </motion.div>
  );
}
