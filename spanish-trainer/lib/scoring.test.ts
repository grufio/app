import { describe, expect, it } from "vitest";
import { BASE_POINTS, CONJUGATION_BONUS, comboMultiplier, pointsFor } from "./scoring";
import type { VocabItem } from "./types";

const noun: VocabItem = { id: "n", es: "el gato", de: "die Katze", type: "noun", unit: 5 };
const conj: VocabItem = { id: "c", es: "hablo", de: "ich spreche", type: "conjugation", unit: 5 };

describe("comboMultiplier", () => {
  it("grows with streak and starts at 1", () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(2)).toBe(1);
    expect(comboMultiplier(3)).toBe(1.5);
    expect(comboMultiplier(6)).toBe(2);
    expect(comboMultiplier(10)).toBe(3);
  });
});

describe("pointsFor", () => {
  it("awards base points with no combo", () => {
    expect(pointsFor(noun, 0)).toBe(BASE_POINTS);
  });

  it("adds a bonus for conjugations", () => {
    expect(pointsFor(conj, 0)).toBe(BASE_POINTS + CONJUGATION_BONUS);
  });

  it("applies the combo multiplier from the streak before the answer", () => {
    expect(pointsFor(noun, 3)).toBe(Math.round(BASE_POINTS * 1.5));
    expect(pointsFor(conj, 6)).toBe((BASE_POINTS + CONJUGATION_BONUS) * 2);
  });
});
