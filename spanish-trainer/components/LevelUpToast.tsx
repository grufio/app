"use client";

import { motion } from "framer-motion";
import { PartyPopper } from "lucide-react";

/**
 * Level-up checkpoint shown as an inline interstitial between question blocks.
 * Navigation (Weiter / Zurück) is driven by the surrounding NavControls, so this
 * is purely presentational.
 */
export function LevelUpToast({ level }: { level: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 18 }}
      className="flex flex-col items-center gap-3 rounded-3xl border border-line bg-surface px-10 py-10 text-center shadow-[0_10px_40px_rgba(0,0,0,0.08)]"
    >
      <PartyPopper className="h-12 w-12 text-brand" aria-hidden />
      <p className="text-sm uppercase tracking-widest text-ink-soft">Checkpoint</p>
      <p className="text-2xl font-semibold tracking-tight text-ink">Level {level}!</p>
      <p className="text-sm text-ink-soft">Weiter geht’s mit „Weiter“ — oder mit „Zurück“ zurück.</p>
    </motion.div>
  );
}
