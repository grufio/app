export type WordType =
  | "noun"
  | "verb"
  | "adjective"
  | "phrase"
  | "conjugation"
  | "other";

export interface VocabItem {
  /** Stable unique id. */
  id: string;
  /** Spanish term, e.g. "el ordenador" or "yo hablo". */
  es: string;
  /** German translation, e.g. "der Computer" or "ich spreche". */
  de: string;
  type: WordType;
  /** Article for nouns. */
  article?: "el" | "la";
  /** Optional example sentence used by the hint panel. */
  example?: { es: string; de: string };
  // Conjugation-only metadata:
  infinitive?: string;
  person?: string;
  tense?: string;
  unit: 5;
  /**
   * Set to true while the transcription from the textbook photo is not yet
   * verified by the user. Rendered with a small marker in the UI.
   */
  needsCheck?: boolean;
}

export type Direction = "es-de" | "de-es";
