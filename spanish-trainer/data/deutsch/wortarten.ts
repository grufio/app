import type { McItem } from "@/lib/mc";

/** Deutsch — Wortarten (Sprachgebrauch & Sprachreflexion, Deutschbuch S. 293–296). */
export const wortarten: McItem[] = [
  {
    id: "wrt-nomen",
    topic: "Wortarten",
    stem: "Welche Wortart ist „Haus“?",
    options: ["Nomen", "Verb", "Adjektiv", "Adverb"],
    correctIndex: 0,
  },
  {
    id: "wrt-verb",
    topic: "Wortarten",
    stem: "Welche Wortart ist „laufen“?",
    options: ["Adjektiv", "Verb", "Nomen", "Pronomen"],
    correctIndex: 1,
  },
  {
    id: "wrt-adjektiv",
    topic: "Wortarten",
    stem: "Welche Wortart ist „schön“?",
    options: ["Adverb", "Artikel", "Adjektiv", "Verb"],
    correctIndex: 2,
  },
  {
    id: "wrt-artikel",
    topic: "Wortarten",
    stem: "Was sind „der, die, das“ für Wörter?",
    options: ["Pronomen", "Präpositionen", "Konjunktionen", "Artikel"],
    correctIndex: 3,
  },
  {
    id: "wrt-pronomen",
    topic: "Wortarten",
    stem: "Was sind „ich, du, er“ für Wörter?",
    options: ["Pronomen", "Artikel", "Adverbien", "Nomen"],
    correctIndex: 0,
  },
  {
    id: "wrt-konjunktion",
    topic: "Wortarten",
    stem: "Was sind „und, oder, aber, weil“ für Wörter?",
    options: ["Präpositionen", "Konjunktionen (Bindewörter)", "Adverbien", "Artikel"],
    correctIndex: 1,
  },
  {
    id: "wrt-praeposition",
    topic: "Wortarten",
    stem: "Was sind „in, auf, unter, hinter“ für Wörter?",
    options: ["Konjunktionen", "Pronomen", "Präpositionen", "Adjektive"],
    correctIndex: 2,
  },
  {
    id: "wrt-grossschreibung",
    topic: "Wortarten",
    stem: "Welche Wortart schreibt man immer groß?",
    options: ["Verben", "Adjektive", "Adverbien", "Nomen"],
    correctIndex: 3,
  },
  {
    id: "wrt-konjugieren",
    topic: "Wortarten",
    stem: "Welche Wortart kann man konjugieren (beugen nach Person und Zeit)?",
    options: ["Das Verb", "Das Nomen", "Das Adjektiv", "Die Präposition"],
    correctIndex: 0,
  },
  {
    id: "wrt-steigern",
    topic: "Wortarten",
    stem: "Welche Wortart kann man steigern (z. B. schnell – schneller – am schnellsten)?",
    options: ["Das Nomen", "Das Adjektiv", "Das Verb", "Der Artikel"],
    correctIndex: 1,
  },
  {
    id: "wrt-genus",
    topic: "Wortarten",
    stem: "Woran erkennt man das Genus (grammatische Geschlecht) eines Nomens?",
    options: ["An der Silbenzahl", "An der Endung des Verbs", "Am Artikel", "An der Großschreibung"],
    correctIndex: 2,
  },
  {
    id: "wrt-kasus-anzahl",
    topic: "Wortarten",
    stem: "Wie viele Fälle (Kasus) gibt es im Deutschen?",
    options: ["sechs", "drei", "fünf", "vier"],
    correctIndex: 3,
  },
];
