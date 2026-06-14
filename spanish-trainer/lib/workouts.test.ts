import { describe, expect, it } from "vitest";
import { pickWorkout, WORKOUTS, WORKOUT_SECONDS } from "./workouts";
import { mulberry32 } from "./rng";

describe("workouts", () => {
  it("every workout has a title and at least one step", () => {
    for (const w of WORKOUTS) {
      expect(w.title.length).toBeGreaterThan(0);
      expect(w.steps.length).toBeGreaterThan(0);
    }
  });

  it("pickWorkout returns a workout from the list", () => {
    expect(WORKOUTS).toContain(pickWorkout(mulberry32(3)));
  });

  it("pickWorkout is deterministic for a given seed", () => {
    expect(pickWorkout(mulberry32(7))).toBe(pickWorkout(mulberry32(7)));
  });

  it("the workout lasts five minutes", () => {
    expect(WORKOUT_SECONDS).toBe(300);
  });
});
