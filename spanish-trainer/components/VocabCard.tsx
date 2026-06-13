"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { Question } from "@/lib/choices";
import { TriangleAlert } from "lucide-react";
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
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className="relative flex w-full flex-col items-center gap-5 rounded-3xl border border-slate-700 bg-slate-900/60 px-6 py-10 shadow-xl"
    >
      <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-400">
        {DIRECTION_LABEL[direction]}
      </span>

      <div className="flex items-center gap-3">
        <h1 className="text-center text-4xl font-bold text-white sm:text-5xl">
          {prompt}
        </h1>
      </div>

      <SpeakerButton text={spanishSpeechText(item.es)} disabled={speakerDisabled} />

      {item.needsCheck && (
        <span
          title="Transkription noch zu prüfen"
          className="absolute right-3 top-3 text-amber-400/70"
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
            className="pointer-events-none absolute right-6 top-8 text-2xl font-extrabold text-emerald-300"
          >
            +{lastGain}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
