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
          <span className="text-2xl font-semibold tabular-nums text-ink">{score}</span>
          <span className="text-ink-soft">Punkte</span>
        </div>
        <div className="flex items-center gap-3 text-ink-soft">
          <span className="rounded-md bg-canvas px-2 py-0.5 font-medium text-ink">
            Level {level}
          </span>
          <span className="flex items-center gap-1 tabular-nums" title="Bestwert">
            <Trophy className="h-4 w-4" aria-hidden /> {highScore}
          </span>
        </div>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/10">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mt-1 text-right text-xs text-ink-soft tabular-nums">
        {index} / {total}
      </div>
    </div>
  );
}
