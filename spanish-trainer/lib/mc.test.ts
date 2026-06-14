import { describe, expect, it } from "vitest";
import { buildMcQuestion, type McItem } from "./mc";
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
