import type { Direction, VocabItem } from "./types";

const TYPE_LABEL: Record<VocabItem["type"], string> = {
  noun: "Nomen",
  verb: "Verb",
  adjective: "Adjektiv",
  phrase: "Wendung",
  conjugation: "Konjugation",
  other: "Wort",
};

/**
 * Build the progressive, context-dependent hint layers for a card. Only
 * layers that actually have data are returned, so a card with no example
 * sentence simply skips that step.
 */
export function hintLayers(item: VocabItem, direction: Direction): string[] {
  const target = direction === "es-de" ? item.de : item.es;
  const layers: string[] = [];

  // 1) Word type / article / conjugation metadata.
  if (item.type === "conjugation") {
    const parts = [item.infinitive, item.tense, item.person].filter(Boolean);
    layers.push(`Konjugation · ${parts.join(" · ")}`);
  } else if (item.type === "noun" && item.article) {
    layers.push(`${TYPE_LABEL.noun} · ${item.article}`);
  } else {
    layers.push(TYPE_LABEL[item.type]);
  }

  // 2) Example sentence (with the target word blanked out), if available.
  if (item.example) {
    const sentence = direction === "es-de" ? item.example.de : item.example.es;
    layers.push(`„${blank(sentence, target)}“`);
  }

  // 3) First letter + length pattern.
  layers.push(letterPattern(target));

  return layers;
}

function blank(sentence: string, word: string): string {
  const core = word.replace(/^(el|la|los|las)\s+/i, "");
  if (!core) return sentence;
  const re = new RegExp(escapeRegExp(core), "i");
  return re.test(sentence) ? sentence.replace(re, "_____") : sentence;
}

function letterPattern(word: string): string {
  return word
    .split("")
    .map((ch, i) => (i === 0 || ch === " " ? ch : "_"))
    .join(" ")
    .replace(/\s+_/g, " _");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
