import { describe, expect, it } from "vitest";
import { articleFromTerm, hintLayers, letterReveal, lengthMask } from "./hints";
import type { VocabItem } from "./types";

const noun: VocabItem = {
  id: "ordenador",
  es: "el ordenador",
  de: "der Computer",
  type: "noun",
  article: "el",
  topic: "Technik",
  unit: 5,
  example: { es: "Trabajo con el ordenador.", de: "Ich arbeite mit dem Computer." },
};

describe("articleFromTerm", () => {
  it("detects German and Spanish articles, including parenthesised ones", () => {
    expect(articleFromTerm("der Computer")).toBe("der");
    expect(articleFromTerm("el ordenador")).toBe("el");
    expect(articleFromTerm("(das) Englisch")).toBe("das");
  });

  it("returns null when there is no leading article", () => {
    expect(articleFromTerm("según")).toBeNull();
    expect(articleFromTerm("hablar")).toBeNull();
  });
});

describe("lengthMask", () => {
  it("masks all letters but preserves the word count", () => {
    const mask = lengthMask("el ordenador");
    expect(mask).not.toMatch(/\p{L}/u);
    expect(mask).toContain("·"); // two words → separator present
  });
});

describe("letterReveal", () => {
  it("reveals only the first letter at fraction 0", () => {
    const out = letterReveal("vuestra", 0);
    expect(out.startsWith("v")).toBe(true);
    expect([...out].filter((c) => /\p{L}/u.test(c))).toHaveLength(1);
  });

  it("reveals about half the letters at fraction 0.5", () => {
    const revealed = [...letterReveal("computer", 0.5)].filter((c) => /\p{L}/u.test(c));
    expect(revealed).toHaveLength(4);
  });
});

describe("hintLayers", () => {
  it("starts with topic + type and derives the target-language article", () => {
    const esDe = hintLayers(noun, "es-de"); // target German
    expect(esDe[0]).toContain("Thema: Technik");
    expect(esDe[1]).toContain("der");

    const deEs = hintLayers(noun, "de-es"); // target Spanish
    expect(deEs[1]).toContain("el");
  });

  it("includes a blanked example and a letter layer", () => {
    const layers = hintLayers(noun, "es-de");
    expect(layers.some((l) => l.includes("_____"))).toBe(true);
    expect(layers.length).toBeGreaterThanOrEqual(4);
  });

  it("exposes infinitive metadata for conjugations", () => {
    const conj: VocabItem = {
      id: "hablar-yo",
      es: "hablo",
      de: "ich spreche",
      type: "conjugation",
      infinitive: "hablar",
      person: "yo",
      tense: "presente",
      unit: 5,
    };
    const layers = hintLayers(conj, "es-de");
    expect(layers[0]).toContain("Verb-Konjugation");
    expect(layers.some((l) => l.includes("hablar"))).toBe(true);
  });
});
