import { describe, expect, it } from "vitest";
import type { McItem, PhysikTopic } from "./mc";
import { optik } from "@/data/physik/optik";
import { akustik } from "@/data/physik/akustik";
import { stromkreis } from "@/data/physik/stromkreis";
import { magnetismus } from "@/data/physik/magnetismus";
import { groessen } from "@/data/physik/groessen";

const BANKS: Record<string, { items: McItem[]; topic: PhysikTopic }> = {
  optik: { items: optik, topic: "Optik" },
  akustik: { items: akustik, topic: "Akustik" },
  stromkreis: { items: stromkreis, topic: "Stromkreis" },
  magnetismus: { items: magnetismus, topic: "Magnetismus" },
  groessen: { items: groessen, topic: "Größen" },
};

const ALL: McItem[] = Object.values(BANKS).flatMap((b) => b.items);

describe("physik question banks", () => {
  it("has 20 questions per bank (~100 total)", () => {
    for (const [name, { items }] of Object.entries(BANKS)) {
      expect(items.length, name).toBe(20);
    }
    expect(ALL.length).toBe(100);
  });

  it("uses globally unique ids", () => {
    const ids = ALL.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("tags every item with its bank's topic", () => {
    for (const { items, topic } of Object.values(BANKS)) {
      for (const q of items) expect(q.topic).toBe(topic);
    }
  });

  it("has exactly 4 non-empty, distinct options per item", () => {
    for (const q of ALL) {
      expect(q.options.length, q.id).toBe(4);
      for (const opt of q.options) expect(opt.trim().length, q.id).toBeGreaterThan(0);
      expect(new Set(q.options).size, q.id).toBe(q.options.length);
    }
  });

  it("has a valid correctIndex and a non-empty stem", () => {
    for (const q of ALL) {
      expect(Number.isInteger(q.correctIndex), q.id).toBe(true);
      expect(q.correctIndex, q.id).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex, q.id).toBeLessThan(q.options.length);
      expect(q.stem.trim().length, q.id).toBeGreaterThan(0);
    }
  });

  it("does not always put the correct answer in the same slot", () => {
    const slots = new Set(ALL.map((q) => q.correctIndex));
    expect(slots.size).toBeGreaterThan(1);
  });
});
