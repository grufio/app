import { describe, expect, it } from "vitest";
import {
  buildSessionDeck,
  recordResult,
  totalAnswered,
  type SrsMap,
} from "./store";
import { mulberry32 } from "../rng";

describe("physik store", () => {
  it("promotes a correct answer up the Leitner boxes (capped at 5)", () => {
    let map: SrsMap = {};
    for (let i = 0; i < 7; i++) map = recordResult(map, "q1", "correct");
    expect(map.q1.box).toBe(5);
    expect(map.q1.seen).toBe(7);
    expect(map.q1.correct).toBe(7);
  });

  it("resets the box to 1 on a wrong answer but still counts it as seen", () => {
    let map: SrsMap = {};
    map = recordResult(map, "q1", "correct"); // box 2
    map = recordResult(map, "q1", "correct"); // box 3
    map = recordResult(map, "q1", "wrong"); // box 1
    expect(map.q1.box).toBe(1);
    expect(map.q1.seen).toBe(3);
    expect(map.q1.correct).toBe(2);
  });

  it("sums seen counts in totalAnswered", () => {
    let map: SrsMap = {};
    map = recordResult(map, "a", "correct");
    map = recordResult(map, "b", "wrong");
    map = recordResult(map, "a", "correct");
    expect(totalAnswered(map)).toBe(3);
  });

  it("includes every item when nothing is mastered", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: `q${i}` }));
    const deck = buildSessionDeck(items, {}, mulberry32(1));
    expect(deck).toHaveLength(10);
    expect(new Set(deck.map((d) => d.id)).size).toBe(10);
  });
});
