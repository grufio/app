import { describe, expect, it } from "vitest";
import type { McItem, PhysikTopic } from "./mc";
import { optLicht } from "@/data/physik/opt-licht";
import { optSpiegel } from "@/data/physik/opt-spiegel";
import { optLinsen } from "@/data/physik/opt-linsen";
import { optFarben } from "@/data/physik/opt-farben";
import { optKlassenarbeit } from "@/data/physik/opt-klassenarbeit";
import { akuSchall } from "@/data/physik/aku-schall";
import { akuTon } from "@/data/physik/aku-ton";
import { akuHoeren } from "@/data/physik/aku-hoeren";
import { strGrundlagen } from "@/data/physik/str-grundlagen";
import { strSchaltungen } from "@/data/physik/str-schaltungen";
import { strWirkungen } from "@/data/physik/str-wirkungen";
import { magPole } from "@/data/physik/mag-pole";
import { magFeld } from "@/data/physik/mag-feld";
import { magElektro } from "@/data/physik/mag-elektro";
import { grsGroessen } from "@/data/physik/grs-groessen";
import { grsMessen } from "@/data/physik/grs-messen";

const TOPICS: PhysikTopic[] = ["Optik", "Akustik", "Stromkreis", "Magnetismus", "Größen"];

const BANKS: Record<string, { items: McItem[]; topic: PhysikTopic }> = {
  "opt-licht": { items: optLicht, topic: "Optik" },
  "opt-spiegel": { items: optSpiegel, topic: "Optik" },
  "opt-linsen": { items: optLinsen, topic: "Optik" },
  "opt-farben": { items: optFarben, topic: "Optik" },
  "opt-klassenarbeit": { items: optKlassenarbeit, topic: "Optik" },
  "aku-schall": { items: akuSchall, topic: "Akustik" },
  "aku-ton": { items: akuTon, topic: "Akustik" },
  "aku-hoeren": { items: akuHoeren, topic: "Akustik" },
  "str-grundlagen": { items: strGrundlagen, topic: "Stromkreis" },
  "str-schaltungen": { items: strSchaltungen, topic: "Stromkreis" },
  "str-wirkungen": { items: strWirkungen, topic: "Stromkreis" },
  "mag-pole": { items: magPole, topic: "Magnetismus" },
  "mag-feld": { items: magFeld, topic: "Magnetismus" },
  "mag-elektro": { items: magElektro, topic: "Magnetismus" },
  "grs-groessen": { items: grsGroessen, topic: "Größen" },
  "grs-messen": { items: grsMessen, topic: "Größen" },
};

const ALL: McItem[] = Object.values(BANKS).flatMap((b) => b.items);

describe("physik sub-area banks", () => {
  it("has at least 8 questions per sub-area and ~150 total", () => {
    for (const [name, { items }] of Object.entries(BANKS)) {
      expect(items.length, name).toBeGreaterThanOrEqual(8);
    }
    expect(ALL.length).toBeGreaterThanOrEqual(140);
    expect(ALL.length).toBeLessThanOrEqual(180);
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

  it("does not always put the correct answer in the same slot", () => {
    const slots = new Set(ALL.map((q) => q.correctIndex));
    expect(slots.size).toBeGreaterThan(1);
  });
});
