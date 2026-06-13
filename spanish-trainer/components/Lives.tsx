"use client";

import { motion } from "framer-motion";
import { Heart } from "lucide-react";
import { MAX_MISTAKES } from "@/lib/useTrainer";

export function Lives({ lives }: { lives: number }) {
  return (
    <div className="flex items-center gap-1" aria-label={`${lives} von ${MAX_MISTAKES} Leben`}>
      {Array.from({ length: MAX_MISTAKES }).map((_, i) => {
        const alive = i < lives;
        return (
          <motion.span
            key={i}
            className="leading-none"
            animate={{ scale: alive ? 1 : 0.85, opacity: alive ? 1 : 0.35 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            <Heart
              className={
                alive
                  ? "h-5 w-5 fill-rose-500 text-rose-500"
                  : "h-5 w-5 text-slate-600"
              }
              aria-hidden
            />
          </motion.span>
        );
      })}
    </div>
  );
}
