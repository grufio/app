import { describe, expect, it } from "vitest";
import { buildQuestion, NUM_OPTIONS, pickDirection } from "./choices";
import { mulberry32 } from "./rng";
import type { VocabItem } from "./types";

const pool: VocabItem[] = [
  { id: "a", es: "el gato", de: "die Katze", type: "noun", unit: 5 },
  { id: "b", es: "el perro", de: "der Hund", type: "noun", unit: 5 },
  { id: "c", es: "la casa", de: "das Haus", type: "noun", unit: 5 },
  { id: "d", es: "el árbol", de: "der Baum", type: "noun", unit: 5 },
  { id: "e", es: "la flor", de: "die Blume", type: "noun", unit: 5 },
  { id: "f", es: "hablo", de: "ich spreche", type: "conjugation", unit: 5 },
  { id: "g", es: "como", de: "ich esse", type: "conjugation", unit: 5 },
];

describe("buildQuestion", () => {
  it("returns exactly 5 unique options including the correct answer", () => {
    const q = buildQuestion(pool[0], pool, mulberry32(1), "es-de");
    expect(q.options).toHaveLength(NUM_OPTIONS);
    expect(new Set(q.options).size).toBe(NUM_OPTIONS);
    expect(q.options).toContain(q.answer);
    expect(q.answer).toBe("die Katze");
    expect(q.prompt).toBe("el gato");
  });

  it("uses the German prompt and Spanish answer in de-es direction", () => {
    const q = buildQuestion(pool[0], pool, mulberry32(2), "de-es");
    expect(q.prompt).toBe("die Katze");
    expect(q.answer).toBe("el gato");
  });

  it("prefers distractors of the same word type when enough exist", () => {
    const q = buildQuestion(pool[0], pool, mulberry32(3), "es-de");
    const distractors = q.options.filter((o) => o !== q.answer);
    const nounTexts = pool
      .filter((p) => p.type === "noun" && p.id !== "a")
      .map((p) => p.de);
    // 4 noun distractors are available, so all distractors should be nouns.
    for (const d of distractors) expect(nounTexts).toContain(d);
  });

  it("is deterministic for a given seed", () => {
    const a = buildQuestion(pool[1], pool, mulberry32(42), "es-de");
    const b = buildQuestion(pool[1], pool, mulberry32(42), "es-de");
    expect(a.options).toEqual(b.options);
  });

  it("pickDirection is stable per seed+index", () => {
    expect(pickDirection(7, 0)).toBe(pickDirection(7, 0));
  });
});
