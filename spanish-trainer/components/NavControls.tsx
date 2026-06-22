"use client";

/**
 * Self-paced quiz navigation: move between questions with Zurück / Weiter (or
 * Überspringen for an already-mastered question). These are pure navigation
 * controls — answering (and its instant feedback) happens on the answer surface
 * itself. Resetting a test's progress is intentionally NOT here: only the admin
 * area can clear stats/progress, so the learners can't wipe their own history.
 */
export function NavControls({
  canPrev,
  canNext,
  canSkip = false,
  onPrev,
  onNext,
  onSkip,
}: {
  canPrev: boolean;
  canNext: boolean;
  /** Offer "Überspringen" on an unanswered, already-mastered question. */
  canSkip?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSkip?: () => void;
}) {
  // While a question is unanswered but skippable, the forward button skips it;
  // once answered it advances as usual.
  const skipping = !canNext && canSkip;
  return (
    <div className="flex w-full gap-2">
      <button
        type="button"
        onClick={onPrev}
        disabled={!canPrev}
        className="flex-1 rounded-full border border-line bg-surface px-4 py-2.5 text-[17px] font-medium text-ink transition hover:bg-canvas active:scale-95 disabled:pointer-events-none disabled:opacity-40"
      >
        ‹ Zurück
      </button>
      <button
        type="button"
        onClick={skipping ? onSkip : onNext}
        disabled={!canNext && !skipping}
        className="flex-[2] rounded-full bg-brand px-4 py-2.5 text-[17px] font-medium text-white transition hover:bg-brand-hover active:scale-95 disabled:pointer-events-none disabled:opacity-40"
      >
        {skipping ? "Überspringen ›" : "Weiter ›"}
      </button>
    </div>
  );
}
