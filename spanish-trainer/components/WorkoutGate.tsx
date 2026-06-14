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
      className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.8, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 22 }}
        className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl border border-emerald-400/40 bg-slate-900 px-6 py-7 text-center shadow-2xl"
      >
        <div className="flex items-center gap-2 text-emerald-300">
          <Dumbbell className="h-6 w-6" aria-hidden />
          <span className="text-sm font-bold uppercase tracking-widest">Kämpfe dafür</span>
        </div>
        <p className="text-sm text-slate-300">
          Gratis-Hinweise aufgebraucht. Beweg dich 5 Minuten — danach gibt&apos;s
          den nächsten Hinweis. (Bewegung macht den Kopf frei.)
        </p>

        <p className="text-lg font-extrabold text-white">{workout.title}</p>
        <ul className="w-full space-y-2 text-left">
          {workout.steps.map((step, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => toggle(i)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-sm transition ${
                  done.has(i)
                    ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-100 line-through"
                    : "border-slate-700 bg-slate-800/60 text-slate-200"
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                    done.has(i) ? "border-emerald-400 bg-emerald-500/30" : "border-slate-500"
                  }`}
                >
                  {done.has(i) && <Check className="h-3.5 w-3.5" aria-hidden />}
                </span>
                {step}
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-1 flex items-center gap-2 text-3xl font-black tabular-nums text-white">
          <Timer className="h-7 w-7 text-emerald-300" aria-hidden />
          {format(secondsLeft)}
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700/60">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-indigo-400 transition-[width] duration-1000 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        <button
          type="button"
          onClick={onComplete}
          disabled={!ready}
          className="mt-2 w-full rounded-full bg-emerald-500 px-6 py-3 text-base font-bold text-slate-950 transition hover:bg-emerald-400 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {ready ? "Hinweis freischalten" : `Noch ${format(secondsLeft)}`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 text-xs text-slate-400 transition hover:text-slate-200"
        >
          <X className="h-3.5 w-3.5" aria-hidden /> Abbrechen (ohne Hinweis)
        </button>
      </motion.div>
    </motion.div>
  );
}
