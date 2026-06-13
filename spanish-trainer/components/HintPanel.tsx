"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Direction, VocabItem } from "@/lib/types";
import { hintLayers } from "@/lib/hints";

export function HintPanel({
  item,
  direction,
}: {
  item: VocabItem;
  direction: Direction;
}) {
  const [revealed, setRevealed] = useState(0);
  const layers = hintLayers(item, direction);

  // Reset whenever the card changes.
  useEffect(() => setRevealed(0), [item.id, direction]);

  const more = revealed < layers.length;

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => setRevealed((n) => Math.min(n + 1, layers.length))}
        disabled={!more}
        className="rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-1.5 text-sm font-medium text-amber-200 transition hover:bg-amber-400/20 active:scale-95 disabled:opacity-40"
      >
        💡 {revealed === 0 ? "Hinweis" : more ? "Mehr Hinweis" : "Kein Hinweis mehr"}
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
