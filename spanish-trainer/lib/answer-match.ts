export type MatchResult = "correct" | "almost" | "wrong";

const ARTICLE_RE = /^\(?(der|die|das|los|las|el|la)\)?\s+/i;
const GENDER_SHORTHAND_RE = /,\s*-\w+/g;

function stripDiacritics(value: string): string {
  // Remove combining diacritical marks (U+0300–U+036F) after NFD decomposition.
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Lowercase, drop punctuation/parens, collapse whitespace. Keeps diacritics & ß. */
function exactNorm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,;:!¡?¿"'`´()/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Looser form: diacritics removed, ß→ss, common abbreviations expanded. */
function looseNorm(value: string): string {
  let out = exactNorm(value).replace(/ß/g, "ss");
  out = stripDiacritics(out);
  out = out
    .replace(/\bjdm\b/g, "jemand")
    .replace(/\bjmd\b/g, "jemand")
    .replace(/\betw\b/g, "etwas");
  return out;
}

/** Split a target into its accepted alternatives (separated by ";"). */
function alternatives(target: string): string[] {
  return target
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Variants of one alternative: with/without parenthetical, gender shorthand, article. */
function variantsOf(alt: string): string[] {
  const noParens = alt.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const out = new Set<string>();
  for (const base of [alt, noParens]) {
    const noGender = base.replace(GENDER_SHORTHAND_RE, "").trim();
    if (noGender) {
      out.add(noGender);
      out.add(noGender.replace(ARTICLE_RE, "").trim());
    }
  }
  return [...out].filter(Boolean);
}

function acceptedSet(target: string, norm: (s: string) => string): Set<string> {
  const set = new Set<string>();
  for (const alt of alternatives(target)) {
    for (const variant of variantsOf(alt)) set.add(norm(variant));
  }
  return set;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 1) return 2; // we only care about <= 1
  const prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diag = tmp;
    }
  }
  return prev[n];
}

/**
 * Grade a typed answer against the target translation.
 * - "correct": exact match (accents/ß count) with an accepted form.
 * - "almost": matches only loosely (missing accents, ß/ss, abbreviations) or a
 *   single typo away — accepted but imperfect.
 * - "wrong": otherwise.
 */
export function matchAnswer(input: string, target: string): MatchResult {
  const inExact = exactNorm(input);
  if (!inExact) return "wrong";

  if (acceptedSet(target, exactNorm).has(inExact)) return "correct";

  const inLoose = looseNorm(input);
  const loose = acceptedSet(target, looseNorm);
  if (loose.has(inLoose)) return "almost";

  // Typo tolerance: only for longer words to avoid false positives on "es"/"su".
  if (inLoose.length >= 4) {
    for (const form of loose) {
      if (form.length >= 4 && levenshtein(inLoose, form) <= 1) return "almost";
    }
  }

  return "wrong";
}

/** Canonical spelling (with accents) to show after answering. */
export function correctDisplay(target: string): string {
  return alternatives(target)[0] ?? target.trim();
}

/** True if the target is effectively a single word (so it can be typed). */
export function isSingleWordTarget(target: string): boolean {
  const core = variantsOf(alternatives(target)[0] ?? target).sort(
    (a, b) => a.length - b.length,
  )[0];
  return !!core && !/\s/.test(core);
}
