"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Dumbbell, Timer, X } from "lucide-react";
import { pickWorkout, WORKOUT_SECONDS } from "@/lib/workouts";

function format(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function WorkoutGate({
  onComplete,
  onCancel,
}: {
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [workout] = useState(() => pickWorkout());
  const [secondsLeft, setSecondsLeft] = useState(WORKOUT_SECONDS);
  const [done, setDone] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const ready = secondsLeft <= 0;
  const progress = 1 - secondsLeft / WORKOUT_SECONDS;

  function toggle(i: number) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.85, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 22 }}
        className="flex max-h-[90dvh] w-full max-w-sm flex-col items-center gap-4 overflow-y-auto rounded-3xl border border-line bg-surface px-6 py-7 text-center shadow-[0_10px_40px_rgba(0,0,0,0.12)]"
      >
        <div className="flex items-center gap-2 text-brand">
          <Dumbbell className="h-6 w-6" aria-hidden />
          <span className="text-sm font-semibold uppercase tracking-widest">Kämpfe dafür</span>
        </div>
        <p className="text-sm text-ink-soft">
          Gratis-Hinweise aufgebraucht. Beweg dich 5 Minuten — danach gibt&apos;s
          den nächsten Hinweis. (Bewegung macht den Kopf frei.)
        </p>

        <p className="text-lg font-semibold tracking-tight text-ink">{workout.title}</p>
        <ul className="w-full space-y-2 text-left">
          {workout.steps.map((step, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => toggle(i)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-sm transition ${
                  done.has(i)
                    ? "border-ok/50 bg-ok/10 text-ink line-through"
                    : "border-line bg-canvas text-ink"
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                    done.has(i) ? "border-ok bg-ok/20 text-ok" : "border-black/20"
                  }`}
                >
                  {done.has(i) && <Check className="h-3.5 w-3.5" aria-hidden />}
                </span>
                {step}
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-1 flex items-center gap-2 text-3xl font-semibold tabular-nums text-ink">
          <Timer className="h-7 w-7 text-brand" aria-hidden />
          {format(secondsLeft)}
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-black/10">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-1000 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        <button
          type="button"
          onClick={onComplete}
          disabled={!ready}
          className="mt-2 w-full rounded-full bg-brand px-6 py-3 text-base font-medium text-white transition hover:bg-brand-hover active:scale-95 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-soft"
        >
          {ready ? "Hinweis freischalten" : `Noch ${format(secondsLeft)}`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 text-xs text-ink-soft transition hover:text-ink"
        >
          <X className="h-3.5 w-3.5" aria-hidden /> Abbrechen (ohne Hinweis)
        </button>
      </motion.div>
    </motion.div>
  );
}
