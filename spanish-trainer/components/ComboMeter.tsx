"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Flame } from "lucide-react";

export function ComboMeter({
  streak,
  multiplier,
}: {
  streak: number;
  multiplier: number;
}) {
  const active = streak >= 2;
  return (
    <div className="flex h-7 items-center">
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex items-center gap-1 rounded-full bg-amber-400/15 px-3 py-1 text-xs font-bold text-amber-300 ring-1 ring-amber-400/40"
          >
            <Flame className="h-3.5 w-3.5" aria-hidden />
            {streak}er-Combo · ×{multiplier}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
