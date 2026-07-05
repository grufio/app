import { describe, expect, it } from "vitest";
import type { DeutschTopic, McItem } from "./mc";
import { faelle } from "@/data/deutsch/faelle";
import { wortarten } from "@/data/deutsch/wortarten";
import { satzglieder } from "@/data/deutsch/satzglieder";
import { aktivPassiv } from "@/data/deutsch/aktiv-passiv";
import { tempus } from "@/data/deutsch/tempus";
import { attribute } from "@/data/deutsch/attribute";
import { feldermodell } from "@/data/deutsch/feldermodell";

const TOPICS: DeutschTopic[] = [
  "Aktiv/Passiv",
  "Wortarten",
  "Satzglieder",
  "Feldermodell",
  "Attribute",
  "Tempus",
  "Fälle",
];

const BANKS: Record<string, { items: McItem[]; topic: DeutschTopic }> = {
  wortarten: { items: wortarten, topic: "Wortarten" },
  satzglieder: { items: satzglieder, topic: "Satzglieder" },
  "aktiv-passiv": { items: aktivPassiv, topic: "Aktiv/Passiv" },
  tempus: { items: tempus, topic: "Tempus" },
  attribute: { items: attribute, topic: "Attribute" },
  feldermodell: { items: feldermodell, topic: "Feldermodell" },
  faelle: { items: faelle, topic: "Fälle" },
};

const ALL: McItem[] = Object.values(BANKS).flatMap((b) => b.items);

describe("deutsch grammar banks", () => {
  it("covers all six grammar topics with at least 8 questions each", () => {
    for (const topic of TOPICS) {
      const bank = Object.values(BANKS).find((b) => b.topic === topic);
      expect(bank, topic).toBeDefined();
    }
    for (const [name, { items }] of Object.entries(BANKS)) {
      expect(items.length, name).toBeGreaterThanOrEqual(8);
    }
  });

  it("uses globally unique ids", () => {
    const ids = ALL.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("tags every item with its bank's topic", () => {
    for (const { items, topic } of Object.values(BANKS)) {
      expect(TOPICS).toContain(topic);
      for (const q of items) expect(q.topic, q.id).toBe(topic);
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
