import { describe, expect, it } from "vitest";
import { boxFor, buildSessionDeck, MAX_BOX, recordResult, type SrsMap } from "./srs";
import { mulberry32 } from "./rng";
import type { VocabItem } from "./types";

const items: VocabItem[] = Array.from({ length: 20 }, (_, i) => ({
  id: `w${i}`,
  es: `es${i}`,
  de: `de${i}`,
  type: "noun",
  unit: 5,
}));

describe("recordResult", () => {
  it("promotes on correct and caps at MAX_BOX", () => {
    let m: SrsMap = recordResult({}, "a", "correct");
    expect(boxFor(m, "a")).toBe(2);
    for (let i = 0; i < 10; i++) m = recordResult(m, "a", "correct");
    expect(boxFor(m, "a")).toBe(MAX_BOX);
  });

  it("resets to box 1 on wrong", () => {
    let m = recordResult({}, "a", "correct");
    m = recordResult(m, "a", "correct"); // box 3
    m = recordResult(m, "a", "wrong");
    expect(boxFor(m, "a")).toBe(1);
  });

  it("almost never masters (capped at 2)", () => {
    let m: SrsMap = {};
    for (let i = 0; i < 3; i++) m = recordResult(m, "a", "correct"); // box 4
    expect(boxFor(m, "a")).toBe(4);
    m = recordResult(m, "a", "almost");
    expect(boxFor(m, "a")).toBe(2);
  });
});

describe("buildSessionDeck", () => {
  it("includes every weak word for a fresh learner", () => {
    const deck = buildSessionDeck(items, {}, mulberry32(1));
    expect(deck).toHaveLength(20);
    expect(new Set(deck.map((d) => d.id)).size).toBe(20);
  });

  it("is deterministic for a given seed", () => {
    const a = buildSessionDeck(items, {}, mulberry32(5)).map((d) => d.id);
    const b = buildSessionDeck(items, {}, mulberry32(5)).map((d) => d.id);
    expect(a).toEqual(b);
  });

  it("falls back to all items if everything would be skipped", () => {
    const mastered: SrsMap = Object.fromEntries(
      items.map((it) => [it.id, { box: 5, seen: 9, correct: 9 }]),
    );
    const deck = buildSessionDeck(items, mastered, mulberry32(2));
    expect(deck.length).toBeGreaterThan(0);
  });
});
