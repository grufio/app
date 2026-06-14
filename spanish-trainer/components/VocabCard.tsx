"use client";

import { AnimatePresence, motion } from "framer-motion";
import { TriangleAlert } from "lucide-react";
import type { Question } from "@/lib/choices";
import { spanishSpeechText } from "@/lib/pronunciation";
import { SpeakerButton } from "./SpeakerButton";

const DIRECTION_LABEL: Record<Question["direction"], string> = {
  "es-de": "Spanisch → Deutsch",
  "de-es": "Deutsch → Spanisch",
};

export function VocabCard({
  question,
  answered,
  lastCorrect,
  lastGain,
}: {
  question: Question;
  answered: boolean;
  lastCorrect: boolean | null;
  lastGain: number;
}) {
  const { item, direction, prompt } = question;
  // The speaker always pronounces the Spanish word; hide it until answered in
  // DE→ES mode so it does not give away the solution.
  const speakerDisabled = direction === "de-es" && !answered;

  return (
    <motion.div
      key={item.id}
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className="relative flex w-full flex-col items-center gap-4 rounded-3xl border border-line bg-surface px-6 py-6 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]"
    >
      <span className="rounded-full bg-canvas px-3 py-1 text-xs font-medium uppercase tracking-wide text-ink-soft">
        {DIRECTION_LABEL[direction]}
      </span>

      <h1 className="text-center font-semibold leading-tight tracking-tight text-ink text-[clamp(1.75rem,8vw,2.75rem)]">
        {prompt}
      </h1>

      <SpeakerButton text={spanishSpeechText(item.es)} disabled={speakerDisabled} />

      {item.needsCheck && (
        <span
          title="Transkription noch zu prüfen"
          className="absolute right-3 top-3 text-[#ff9500]"
        >
          <TriangleAlert className="h-4 w-4" aria-hidden />
        </span>
      )}

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
