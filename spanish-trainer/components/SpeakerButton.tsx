"use client";

import { useEffect, useState } from "react";
import { speak, speechSupported } from "@/lib/speech";

export function SpeakerButton({
  text,
  disabled = false,
  label = "Aussprache anhören",
}: {
  text: string;
  disabled?: boolean;
  label?: string;
}) {
  const [supported, setSupported] = useState(true);
  useEffect(() => setSupported(speechSupported()), []);

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={() => speak(text)}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-slate-600 bg-slate-800/70 text-2xl transition hover:bg-slate-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
    >
      🔊
    </button>
  );
}
