import type { McItem } from "@/lib/mc";

/** Deutsch — Attribute (Beifügungen zum Nomen, Deutschbuch S. 304). */
export const attribute: McItem[] = [
  {
    id: "att-definition",
    topic: "Attribute",
    stem: "Was ist ein Attribut?",
    options: [
      "eine Beifügung, die ein Nomen genauer bestimmt",
      "das gebeugte Verb im Satz",
      "ein eigenständiges Satzglied",
      "ein anderes Wort für das Subjekt",
    ],
    correctIndex: 0,
  },
  {
    id: "att-adjektivattribut",
    topic: "Attribute",
    stem: "Welche Art von Attribut ist „rote“ in „das rote Auto“?",
    options: ["Genitivattribut", "Adjektivattribut", "Präpositionalattribut", "Attributsatz"],
    correctIndex: 1,
  },
  {
    id: "att-genitivattribut",
    topic: "Attribute",
    stem: "Welche Art von Attribut ist „meines Vaters“ in „das Haus meines Vaters“?",
    options: ["Adjektivattribut", "Apposition", "Genitivattribut", "Präpositionalattribut"],
    correctIndex: 2,
  },
  {
    id: "att-praepositionalattribut",
    topic: "Attribute",
    stem: "Welche Art von Attribut ist „mit Hut“ in „der Mann mit Hut“?",
    options: ["Adjektivattribut", "Genitivattribut", "Attributsatz", "Präpositionalattribut"],
    correctIndex: 3,
  },
  {
    id: "att-bezug",
    topic: "Attribute",
    stem: "Worauf bezieht sich ein Attribut?",
    options: ["auf ein Nomen", "auf das Verb", "auf den ganzen Satz", "auf das Prädikat"],
    correctIndex: 0,
  },
  {
    id: "att-attributsatz",
    topic: "Attribute",
    stem: "Was ist „der bellt“ in „der Hund, der bellt“?",
    options: ["ein Hauptsatz", "ein Attributsatz (Relativsatz)", "ein Objektsatz", "eine Apposition"],
    correctIndex: 1,
  },
  {
    id: "att-apposition",
    topic: "Attribute",
    stem: "Was ist „die Hauptstadt Deutschlands“ in „Berlin, die Hauptstadt Deutschlands, ist groß.“?",
    options: ["ein Adjektivattribut", "ein Genitivattribut", "eine Apposition (Beisatz)", "ein Relativsatz"],
    correctIndex: 2,
  },
  {
    id: "att-kein-satzglied",
    topic: "Attribute",
    stem: "Ist ein Attribut ein eigenes Satzglied?",
    options: [
      "Ja, immer.",
      "Ja, es ersetzt das Subjekt.",
      "Nein, es ist immer das Prädikat.",
      "Nein, es ist nur ein Teil eines Satzglieds.",
    ],
    correctIndex: 3,
  },
  {
    id: "att-frage",
    topic: "Attribute",
    stem: "Womit erfragt man häufig ein Attribut?",
    options: ["Was für ein? / Welcher?", "Wer oder was?", "Wann?", "Wem?"],
    correctIndex: 0,
  },
  {
    id: "att-adjektivattribut-2",
    topic: "Attribute",
    stem: "Welche Art von Attribut ist „schnelles“ in „ein sehr schnelles Auto“?",
    options: ["Genitivattribut", "Adjektivattribut", "Präpositionalattribut", "Apposition"],
    correctIndex: 1,
  },
  {
    id: "att-genitivattribut-2",
    topic: "Attribute",
    stem: "Welche Art von Attribut ist „der Lehrerin“ in „die Tasche der Lehrerin“?",
    options: ["Adjektivattribut", "Genitivattribut", "Präpositionalattribut", "Apposition"],
    correctIndex: 1,
  },
  {
    id: "att-funktion",
    topic: "Attribute",
    stem: "Wozu dient ein Attribut?",
    options: [
      "Es bestimmt ein Nomen genauer.",
      "Es bildet das Prädikat des Satzes.",
      "Es ersetzt das Subjekt.",
      "Es verbindet zwei Hauptsätze.",
    ],
    correctIndex: 0,
  },
];
