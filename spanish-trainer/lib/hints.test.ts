import { describe, expect, it } from "vitest";
import { hintLayers } from "./hints";
import type { VocabItem } from "./types";

describe("hintLayers", () => {
  it("shows article for nouns and a letter pattern, skipping the missing example", () => {
    const noun: VocabItem = {
      id: "n",
      es: "el ordenador",
      de: "der Computer",
      type: "noun",
      article: "el",
      unit: 5,
    };
    const layers = hintLayers(noun, "es-de");
    expect(layers[0]).toContain("el");
    expect(layers).toHaveLength(2); // type + letter pattern, no example
    expect(layers[1].startsWith("d")).toBe(true); // first letter of "der Computer"
  });

  it("includes a blanked example sentence when present", () => {
    const item: VocabItem = {
      id: "x",
      es: "la casa",
      de: "das Haus",
      type: "noun",
      article: "la",
      unit: 5,
      example: { es: "Vivo en la casa grande.", de: "Ich wohne im großen Haus." },
    };
    const layers = hintLayers(item, "de-es");
    expect(layers).toHaveLength(3);
    expect(layers[1]).toContain("_____");
  });

  it("describes conjugation metadata", () => {
    const conj: VocabItem = {
      id: "c",
      es: "hablo",
      de: "ich spreche",
      type: "conjugation",
      infinitive: "hablar",
      person: "yo",
      tense: "presente",
      unit: 5,
    };
    const layers = hintLayers(conj, "es-de");
    expect(layers[0]).toContain("hablar");
    expect(layers[0]).toContain("yo");
  });
});
