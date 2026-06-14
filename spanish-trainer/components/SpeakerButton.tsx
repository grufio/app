"use client";

import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
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
      className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface text-ink transition hover:bg-canvas active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
    >
      <Volume2 className="h-6 w-6" aria-hidden />
    </button>
  );
}
