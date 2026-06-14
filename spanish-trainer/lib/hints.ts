import type { Direction, VocabItem } from "./types";

const TYPE_LABEL: Record<VocabItem["type"], string> = {
  noun: "Nomen",
  verb: "Verb",
  adjective: "Adjektiv",
  phrase: "Wendung",
  conjugation: "Verb-Konjugation",
  other: "Wort",
};

const ARTICLE_RE = /^\(?(der|die|das|el|la|los|las)\)?\b/i;

/**
 * Progressive, direction-aware hint layers for a card, ordered vague → strong.
 * `target` is always the answer-language word, so every hint helps the learner
 * actually produce the answer. Only layers with real content are included.
 */
export function hintLayers(item: VocabItem, direction: Direction): string[] {
  const target = direction === "es-de" ? item.de : item.es;
  const layers: string[] = [];

  // 1) Topic + word type.
  const type = TYPE_LABEL[item.type];
  layers.push(item.topic ? `Thema: ${item.topic} · ${type}` : type);

  // 2) Structure in the target language: article (derived) + length mask.
  const structure: string[] = [];
  const article = articleFromTerm(target);
  if (article) structure.push(`Artikel: ${article}`);
  structure.push(lengthMask(target));
  layers.push(structure.join("  ·  "));

  // 3) Example sentence with the target word blanked out.
  if (item.example) {
    const sentence = direction === "es-de" ? item.example.de : item.example.es;
    layers.push(`„${blankWord(sentence, target)}“`);
  }

  // 4) First letter revealed.
  layers.push(letterReveal(target, 0));

  // 5) Strongest: ~half revealed; conjugations expose the full grammar instead.
  if (item.type === "conjugation") {
    const parts = [item.infinitive, item.tense, item.person].filter(Boolean);
    if (parts.length) layers.push(`Infinitiv: ${parts.join(" · ")}`);
  } else {
    layers.push(letterReveal(target, 0.5));
  }

  return layers;
}

/** Detect a leading German or Spanish article (handles "(das) Englisch"). */
export function articleFromTerm(term: string): string | null {
  const match = term.trim().match(ARTICLE_RE);
  return match ? match[1].toLowerCase() : null;
}

/** Underscore mask preserving word count and length, punctuation kept. */
export function lengthMask(target: string): string {
  return target
    .trim()
    .split(/\s+/)
    .map((word) => [...word].map((ch) => (isLetter(ch) ? "_" : ch)).join(" "))
    .join("   ·   ");
}

/**
 * Reveal the first `fraction` of letters (at least one), underscoring the rest.
 * Spaces and punctuation are preserved.
 */
export function letterReveal(target: string, fraction: number): string {
  const total = [...target].filter(isLetter).length;
  const reveal = Math.max(1, Math.round(total * fraction));
  let shown = 0;
  return [...target]
    .map((ch) => {
      if (!isLetter(ch)) return ch;
      if (shown < reveal) {
        shown += 1;
        return ch;
      }
      return "_";
    })
    .join(" ")
    .replace(/ {2,}/g, "   ");
}

function blankWord(sentence: string, target: string): string {
  const core = target.replace(ARTICLE_RE, "").trim();
  const candidates = [core, ...core.split(/\s+/)].filter((c) => c.length >= 3);
  for (const candidate of candidates) {
    const re = new RegExp(escapeRegExp(candidate), "i");
    if (re.test(sentence)) return sentence.replace(re, "_____");
  }
  // Fallback: blank the longest word so the layer still hides something.
  const longest = [...sentence.split(/\s+/)].sort((a, b) => b.length - a.length)[0];
  return longest && longest.length >= 4
    ? sentence.replace(longest, "_____")
    : sentence;
}

function isLetter(ch: string): boolean {
  return /\p{L}/u.test(ch);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
