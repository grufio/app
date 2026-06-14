import { type Rng } from "./rng";

export interface Workout {
  title: string;
  /** Ordered exercise steps shown as an instruction checklist. */
  steps: string[];
}

/** Short, equipment-free workout challenges shown instead of an ad. */
export const WORKOUTS: Workout[] = [
  {
    title: "Energie-Boost",
    steps: ["20 Hampelmänner", "10 Kniebeugen", "30 Sek Plank", "15 Ausfallschritte"],
  },
  {
    title: "Wach-Macher",
    steps: ["30 Sek auf der Stelle laufen", "10 Liegestütze", "20 Hampelmänner", "30 Sek Wandsitz"],
  },
  {
    title: "Kopf-frei",
    steps: ["15 Kniebeugen", "30 Sek Hampelmänner", "10 Sit-ups", "20 Sek Plank"],
  },
  {
    title: "Konzentrations-Reset",
    steps: ["1 Min Treppe hoch & runter", "10 Ausfallschritte je Seite", "20 Hampelmänner", "30 Sek Hochstrecken & dehnen"],
  },
];

/** Pick a workout; deterministic when a seeded rng is supplied (for tests). */
export function pickWorkout(rng: Rng = Math.random): Workout {
  const index = Math.floor(rng() * WORKOUTS.length) % WORKOUTS.length;
  return WORKOUTS[index];
}

export const WORKOUT_SECONDS = 5 * 60;
