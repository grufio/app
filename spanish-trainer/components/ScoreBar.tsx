"use client";

import { Trophy } from "lucide-react";

export function ScoreBar({
  score,
  level,
  index,
  total,
  highScore,
}: {
  score: number;
  level: number;
  index: number;
  total: number;
  highScore: number;
}) {
  const progress = total > 0 ? Math.round((index / total) * 100) : 0;
  return (
    <div className="w-full">
      <div className="flex items-end justify-between text-sm">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-extrabold tabular-nums text-white">{score}</span>
          <span className="text-slate-400">Punkte</span>
        </div>
        <div className="flex items-center gap-3 text-slate-400">
          <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 font-semibold text-indigo-300">
            Level {level}
          </span>
          <span className="flex items-center gap-1 tabular-nums" title="Bestwert">
            <Trophy className="h-4 w-4" aria-hidden /> {highScore}
          </span>
        </div>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-700/60">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-emerald-400 transition-[width] duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-1 text-right text-xs text-slate-500 tabular-nums">
        {index} / {total}
      </div>
    </div>
  );
}
