import { describe, expect, it } from "vitest";
import type { McItem, GeschichteTopic } from "./mc";
import { kolAzteken } from "@/data/geschichte/kol-azteken";
import { kolUntergang } from "@/data/geschichte/kol-untergang";
import { kolUreinwohner } from "@/data/geschichte/kol-ureinwohner";
import { kolDreieckshandel } from "@/data/geschichte/kol-dreieckshandel";
import { kolWeltwirtschaft } from "@/data/geschichte/kol-weltwirtschaft";
import { refAblasshandel } from "@/data/geschichte/ref-ablasshandel";
import { refLuther } from "@/data/geschichte/ref-luther";
import { refAugsburg } from "@/data/geschichte/ref-augsburg";

const TOPICS: GeschichteTopic[] = ["Kolonialismus", "Reformation"];

const BANKS: Record<string, { items: McItem[]; topic: GeschichteTopic }> = {
  "kol-azteken": { items: kolAzteken, topic: "Kolonialismus" },
  "kol-untergang": { items: kolUntergang, topic: "Kolonialismus" },
  "kol-ureinwohner": { items: kolUreinwohner, topic: "Kolonialismus" },
  "kol-dreieckshandel": { items: kolDreieckshandel, topic: "Kolonialismus" },
  "kol-weltwirtschaft": { items: kolWeltwirtschaft, topic: "Kolonialismus" },
  "ref-ablasshandel": { items: refAblasshandel, topic: "Reformation" },
  "ref-luther": { items: refLuther, topic: "Reformation" },
  "ref-augsburg": { items: refAugsburg, topic: "Reformation" },
};

const ALL: McItem[] = Object.values(BANKS).flatMap((b) => b.items);

describe("geschichte banks", () => {
  it("has at least 8 questions per bank and a healthy total", () => {
    for (const [name, { items }] of Object.entries(BANKS)) {
      expect(items.length, name).toBeGreaterThanOrEqual(8);
    }
    expect(ALL.length).toBeGreaterThanOrEqual(64);
  });

  it("uses globally unique ids", () => {
    const ids = ALL.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("tags every item with its bank's topic (one of the allowed topics)", () => {
    for (const { items, topic } of Object.values(BANKS)) {
      expect(TOPICS).toContain(topic);
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

  it("gives every question an age-appropriate explanation page", () => {
    for (const q of ALL) {
      expect(q.explanation, q.id).toBeTruthy();
      expect((q.explanation ?? "").trim().length, q.id).toBeGreaterThan(0);
    }
  });

  it("does not always put the correct answer in the same slot", () => {
    const slots = new Set(ALL.map((q) => q.correctIndex));
    expect(slots.size).toBeGreaterThan(1);
  });
});
