"use client";

/**
 * Lightweight sound effects synthesised with the Web Audio API — no audio
 * files to ship. Calm, short tones that reward without overstimulating.
 * Globally mutable mute flag is respected by every cue.
 */

type Cue = "correct" | "wrong" | "levelup" | "win";

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

function tone(
  context: AudioContext,
  freq: number,
  start: number,
  duration: number,
  gain = 0.08,
): void {
  const osc = context.createOscillator();
  const env = context.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(gain, start + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(env).connect(context.destination);
  osc.start(start);
  osc.stop(start + duration);
}

const SEQUENCES: Record<Cue, number[]> = {
  correct: [660, 880],
  wrong: [200, 150],
  levelup: [523, 659, 784],
  win: [523, 659, 784, 1046],
};

export function playCue(cue: Cue): void {
  if (muted) return;
  const context = audioContext();
  if (!context) return;
  if (context.state === "suspended") void context.resume();
  const now = context.currentTime;
  const notes = SEQUENCES[cue];
  const step = cue === "wrong" ? 0.12 : 0.1;
  notes.forEach((freq, i) => {
    tone(context, freq, now + i * step, cue === "wrong" ? 0.18 : 0.16);
  });
}
