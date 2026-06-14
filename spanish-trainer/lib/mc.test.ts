import { describe, expect, it } from "vitest";
import { buildMcDeck, buildMcQuestion, type McItem } from "./mc";
import type { SrsMap } from "./srs";
import { mulberry32 } from "./rng";

const item: McItem = {
  id: "t-1",
  stem: "Testfrage?",
  options: ["A", "B", "C", "D"],
  correctIndex: 2,
  topic: "Optik",
};

describe("buildMcQuestion", () => {
  it("resolves the answer from correctIndex (before shuffling)", () => {
    const q = buildMcQuestion(item, mulberry32(1));
    expect(q.answer).toBe("C");
    expect(q.stem).toBe("Testfrage?");
  });

  it("keeps the answer among the options and preserves the option set", () => {
    const q = buildMcQuestion(item, mulberry32(42));
    expect(q.options).toContain(q.answer);
    expect([...q.options].sort()).toEqual([...item.options].sort());
  });

  it("is deterministic for the same seed", () => {
    const a = buildMcQuestion(item, mulberry32(7));
    const b = buildMcQuestion(item, mulberry32(7));
    expect(a.options).toEqual(b.options);
  });

  it("does not mutate the source item's options", () => {
    const before = [...item.options];
    buildMcQuestion(item, mulberry32(123));
    expect(item.options).toEqual(before);
  });
});

describe("buildMcDeck", () => {
  const items: McItem[] = Array.from({ length: 6 }, (_, i) => ({
    id: `q${i}`,
    stem: "?",
    options: ["a", "b", "c", "d"],
    correctIndex: 0,
    topic: "Optik",
  }));

  it("keeps every question (no skipping)", () => {
    const deck = buildMcDeck(items, {}, mulberry32(1));
    expect(deck).toHaveLength(6);
    expect(new Set(deck.map((d) => d.id)).size).toBe(6);
  });

  it("puts the least-known questions first and well-known ones last", () => {
    // q0 fully mastered (box 5), q1 well known (box 4), q2..q5 unknown (box 1)
    const srs: SrsMap = {
      q0: { box: 5, seen: 3, correct: 3 },
      q1: { box: 4, seen: 2, correct: 2 },
    };
    const deck = buildMcDeck(items, srs, mulberry32(7));
    expect(deck.map((d) => d.id).slice(0, 4).sort()).toEqual(["q2", "q3", "q4", "q5"]);
    expect(deck[4].id).toBe("q1");
    expect(deck[5].id).toBe("q0");
  });
});
