import type { VocabItem } from "@/lib/types";

/**
 * Unidad 5 — Vokabeln.
 *
 * ⚠️  TRANSKRIPTION ZU PRÜFEN
 * Diese Liste wurde aus dem (niedrig aufgelösten) Foto der Buchseite
 * abgeleitet. Die spanisch↔deutschen Paare sind sprachlich korrekt, aber ob
 * jedes Wort exakt zur Unidad 5 des Buches gehört (bzw. die genaue Schreibung
 * im Buch), ist noch nicht verifiziert — daher `needsCheck: true`.
 * Bitte gegen das Buch prüfen / korrigieren oder eine schärfere Foto-Vorlage
 * liefern. Der Unidad-6-Block ("Primer paso", ab Wort nach „según") ist NICHT
 * enthalten.
 */
export const unidad5: VocabItem[] = [
  // ── Technik / Computer ────────────────────────────────────────────────
  {
    id: "ordenador",
    es: "el ordenador",
    de: "der Computer",
    type: "noun",
    article: "el",
    unit: 5,
    needsCheck: true,
    example: {
      es: "Trabajo con el ordenador todos los días.",
      de: "Ich arbeite jeden Tag mit dem Computer.",
    },
  },
  { id: "informatica", es: "la informática", de: "die Informatik", type: "noun", article: "la", unit: 5, needsCheck: true },
  { id: "internet", es: "Internet", de: "das Internet", type: "noun", unit: 5, needsCheck: true },
  {
    id: "correo-electronico",
    es: "el correo electrónico",
    de: "die E-Mail",
    type: "noun",
    article: "el",
    unit: 5,
    needsCheck: true,
  },
  { id: "pantalla", es: "la pantalla", de: "der Bildschirm", type: "noun", article: "la", unit: 5, needsCheck: true },
  { id: "teclado", es: "el teclado", de: "die Tastatur", type: "noun", article: "el", unit: 5, needsCheck: true },
  { id: "raton", es: "el ratón", de: "die Maus", type: "noun", article: "el", unit: 5, needsCheck: true },
  { id: "archivo", es: "el archivo", de: "die Datei", type: "noun", article: "el", unit: 5, needsCheck: true },
  { id: "pagina-web", es: "la página web", de: "die Webseite", type: "noun", article: "la", unit: 5, needsCheck: true },
  { id: "contrasena", es: "la contraseña", de: "das Passwort", type: "noun", article: "la", unit: 5, needsCheck: true },

  // ── Sprachen / Schule ─────────────────────────────────────────────────
  { id: "ingles", es: "el inglés", de: "(das) Englisch", type: "noun", article: "el", unit: 5, needsCheck: true },
  { id: "idioma", es: "el idioma", de: "die Sprache", type: "noun", article: "el", unit: 5, needsCheck: true },
  { id: "palabra", es: "la palabra", de: "das Wort", type: "noun", article: "la", unit: 5, needsCheck: true },
  { id: "frase", es: "la frase", de: "der Satz", type: "noun", article: "la", unit: 5, needsCheck: true },

  // ── Geschichte / Alltag ───────────────────────────────────────────────
  { id: "mayordomo", es: "el mayordomo", de: "der Butler", type: "noun", article: "el", unit: 5, needsCheck: true },
  { id: "mermelada", es: "la mermelada", de: "die Marmelade", type: "noun", article: "la", unit: 5, needsCheck: true },
  { id: "ninera", es: "la niñera", de: "das Kindermädchen", type: "noun", article: "la", unit: 5, needsCheck: true },
  { id: "paraguas", es: "el paraguas", de: "der Regenschirm", type: "noun", article: "el", unit: 5, needsCheck: true },

  // ── Adjektive ─────────────────────────────────────────────────────────
  { id: "util", es: "útil", de: "nützlich", type: "adjective", unit: 5, needsCheck: true },
  { id: "rapido", es: "rápido", de: "schnell", type: "adjective", unit: 5, needsCheck: true },
  { id: "moderno", es: "moderno", de: "modern", type: "adjective", unit: 5, needsCheck: true },
  { id: "dificil", es: "difícil", de: "schwierig", type: "adjective", unit: 5, needsCheck: true },
  { id: "facil", es: "fácil", de: "einfach", type: "adjective", unit: 5, needsCheck: true },

  // ── Wendungen ─────────────────────────────────────────────────────────
  { id: "segun", es: "según", de: "laut / je nach", type: "phrase", unit: 5, needsCheck: true },
  { id: "por-ejemplo", es: "por ejemplo", de: "zum Beispiel", type: "phrase", unit: 5, needsCheck: true },
  { id: "sobre-todo", es: "sobre todo", de: "vor allem", type: "phrase", unit: 5, needsCheck: true },

  // ── Konjugationen: hablar (presente) ──────────────────────────────────
  { id: "hablar-yo", es: "hablo", de: "ich spreche", type: "conjugation", infinitive: "hablar", person: "yo", tense: "presente", unit: 5, needsCheck: true },
  { id: "hablar-tu", es: "hablas", de: "du sprichst", type: "conjugation", infinitive: "hablar", person: "tú", tense: "presente", unit: 5, needsCheck: true },
  { id: "hablar-el", es: "habla", de: "er/sie spricht", type: "conjugation", infinitive: "hablar", person: "él/ella", tense: "presente", unit: 5, needsCheck: true },
  { id: "hablar-nos", es: "hablamos", de: "wir sprechen", type: "conjugation", infinitive: "hablar", person: "nosotros", tense: "presente", unit: 5, needsCheck: true },

  // ── Konjugationen: tener (presente) ───────────────────────────────────
  { id: "tener-yo", es: "tengo", de: "ich habe", type: "conjugation", infinitive: "tener", person: "yo", tense: "presente", unit: 5, needsCheck: true },
  { id: "tener-tu", es: "tienes", de: "du hast", type: "conjugation", infinitive: "tener", person: "tú", tense: "presente", unit: 5, needsCheck: true },
  { id: "tener-el", es: "tiene", de: "er/sie hat", type: "conjugation", infinitive: "tener", person: "él/ella", tense: "presente", unit: 5, needsCheck: true },

  // ── Konjugationen: ser (presente) ─────────────────────────────────────
  { id: "ser-yo", es: "soy", de: "ich bin", type: "conjugation", infinitive: "ser", person: "yo", tense: "presente", unit: 5, needsCheck: true },
  { id: "ser-tu", es: "eres", de: "du bist", type: "conjugation", infinitive: "ser", person: "tú", tense: "presente", unit: 5, needsCheck: true },
  { id: "ser-el", es: "es", de: "er/sie ist", type: "conjugation", infinitive: "ser", person: "él/ella", tense: "presente", unit: 5, needsCheck: true },

  // ── Konjugationen: hacer (presente) ───────────────────────────────────
  { id: "hacer-yo", es: "hago", de: "ich mache", type: "conjugation", infinitive: "hacer", person: "yo", tense: "presente", unit: 5, needsCheck: true },
  { id: "hacer-tu", es: "haces", de: "du machst", type: "conjugation", infinitive: "hacer", person: "tú", tense: "presente", unit: 5, needsCheck: true },
];
