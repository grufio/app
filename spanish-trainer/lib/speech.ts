"use client";

/**
 * Thin wrapper around the Web Speech API for speaking Spanish words aloud.
 * Free and backend-less; voice availability varies by browser/OS (notably
 * iOS Safari), which we treat as a graceful no-op.
 */

let cachedVoice: SpeechSynthesisVoice | null = null;

function pickSpanishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  cachedVoice =
    voices.find((v) => v.lang === "es-ES") ??
    voices.find((v) => v.lang.startsWith("es")) ??
    null;
  return cachedVoice;
}

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speak(text: string, lang = "es-ES"): void {
  if (!speechSupported()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = 0.9;
  const voice = pickSpanishVoice();
  if (voice) utter.voice = voice;
  synth.speak(utter);
}

// Voices load asynchronously in some browsers; refresh the cache when ready.
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null;
    pickSpanishVoice();
  };
}
