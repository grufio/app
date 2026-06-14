"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Dumbbell, Lightbulb } from "lucide-react";
import type { Direction, VocabItem } from "@/lib/types";
import { hintLayers } from "@/lib/hints";

export function HintPanel({
  item,
  direction,
  freeLeft,
  onHintRequest,
}: {
  item: VocabItem;
  direction: Direction;
  /** Free hints remaining this session (<= 0 means the next one costs a workout). */
  freeLeft: number;
  /** Ask the parent to authorize the next reveal; it calls `reveal` when granted. */
  onHintRequest: (reveal: () => void) => void;
}) {
  const [revealed, setRevealed] = useState(0);
  const layers = hintLayers(item, direction);

  // Reset whenever the card changes.
  useEffect(() => setRevealed(0), [item.id, direction]);

  const more = revealed < layers.length;
  const costsWorkout = freeLeft <= 0;

  function handleClick() {
    if (!more) return;
    onHintRequest(() => setRevealed((n) => Math.min(n + 1, layers.length)));
  }

  const label = !more
    ? "Kein Hinweis mehr"
    : costsWorkout
      ? `${revealed === 0 ? "Hinweis" : "Mehr Hinweis"} · Workout`
      : `${revealed === 0 ? "Hinweis" : "Mehr Hinweis"} · noch ${freeLeft} gratis`;

  const tone = costsWorkout
    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20"
    : "border-amber-400/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20";

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={!more}
        className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition active:scale-95 disabled:opacity-40 ${tone}`}
      >
        {costsWorkout && more ? (
          <Dumbbell className="h-4 w-4" aria-hidden />
        ) : (
          <Lightbulb className="h-4 w-4" aria-hidden />
        )}
        {label}
      </button>

      <div className="flex min-h-[1.5rem] flex-col items-center gap-1">
        <AnimatePresence>
          {layers.slice(0, revealed).map((layer, i) => (
            <motion.p
              key={i}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center text-sm text-amber-100/90"
            >
              {layer}
            </motion.p>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
