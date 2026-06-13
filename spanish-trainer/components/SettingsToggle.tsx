"use client";

export function SettingsToggle({
  soundOn,
  animationsOn,
  onToggleSound,
  onToggleAnimations,
}: {
  soundOn: boolean;
  animationsOn: boolean;
  onToggleSound: () => void;
  onToggleAnimations: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onToggleSound}
        aria-pressed={soundOn}
        title={soundOn ? "Ton aus" : "Ton an"}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-800/70 text-base transition hover:bg-slate-700 active:scale-95"
      >
        {soundOn ? "🔉" : "🔇"}
      </button>
      <button
        type="button"
        onClick={onToggleAnimations}
        aria-pressed={animationsOn}
        title={animationsOn ? "Ruhiger Modus (weniger Animation)" : "Animationen an"}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-800/70 text-base transition hover:bg-slate-700 active:scale-95"
      >
        {animationsOn ? "✨" : "🌙"}
      </button>
    </div>
  );
}
