"use client";

import { motion } from "framer-motion";
import { MAX_MISTAKES } from "@/lib/useTrainer";

export function Lives({ lives }: { lives: number }) {
  return (
    <div className="flex items-center gap-1" aria-label={`${lives} von ${MAX_MISTAKES} Leben`}>
      {Array.from({ length: MAX_MISTAKES }).map((_, i) => {
        const alive = i < lives;
        return (
          <motion.span
            key={i}
            className="text-xl leading-none"
            animate={{ scale: alive ? 1 : 0.85, opacity: alive ? 1 : 0.25 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            {alive ? "❤️" : "🤍"}
          </motion.span>
        );
      })}
    </div>
  );
}
