import type { McItem } from "@/lib/mc";

/** Deutsch — Feldermodell / Satzbau (Die Satzklammer, Vor-/Mittel-/Nachfeld, Deutschbuch S. 305). */
export const feldermodell: McItem[] = [
  {
    id: "fld-felder",
    topic: "Feldermodell",
    stem: "Welche Felder gehören zum Feldermodell?",
    options: [
      "Vorfeld, Mittelfeld, Nachfeld",
      "Hauptfeld und Nebenfeld",
      "Anfang, Mitte, Ende",
      "Subjektfeld und Objektfeld",
    ],
    correctIndex: 0,
  },
  {
    id: "fld-vorfeld-eins",
    topic: "Feldermodell",
    stem: "Wie viele Satzglieder stehen im Aussagesatz im Vorfeld?",
    options: ["beliebig viele", "genau ein Satzglied", "mindestens zwei", "keines"],
    correctIndex: 1,
  },
  {
    id: "fld-satzklammer",
    topic: "Feldermodell",
    stem: "Wodurch wird die Satzklammer gebildet?",
    options: [
      "durch zwei Subjekte",
      "durch Komma und Punkt",
      "durch die Teile des Prädikats (finite und infinite Verbform)",
      "durch das Vor- und das Nachfeld",
    ],
    correctIndex: 2,
  },
  {
    id: "fld-vorfeld-subjekt",
    topic: "Feldermodell",
    stem: "Was steht in „Lena hat gestern ein Buch gelesen.“ im Vorfeld?",
    options: ["gestern", "ein Buch", "gelesen", "Lena"],
    correctIndex: 3,
  },
  {
    id: "fld-klammer-beispiel",
    topic: "Feldermodell",
    stem: "Was bildet in „Lena hat gestern ein Buch gelesen.“ die Satzklammer?",
    options: ["hat … gelesen", "Lena … Buch", "gestern … ein", "hat … gestern"],
    correctIndex: 0,
  },
  {
    id: "fld-mittelfeld",
    topic: "Feldermodell",
    stem: "Was liegt zwischen der linken und der rechten Satzklammer?",
    options: ["das Vorfeld", "das Mittelfeld", "das Nachfeld", "die Satzgrenze"],
    correctIndex: 1,
  },
  {
    id: "fld-finites-verb-pos2",
    topic: "Feldermodell",
    stem: "An welcher Stelle steht im Aussagesatz das finite (gebeugte) Verb?",
    options: ["an erster Stelle", "am Satzende", "an zweiter Stelle", "im Nachfeld"],
    correctIndex: 2,
  },
  {
    id: "fld-vorfeld-umstellung",
    topic: "Feldermodell",
    stem: "Was steht in „Gestern hat Lena ein Buch gelesen.“ im Vorfeld?",
    options: ["Lena", "ein Buch", "hat", "Gestern"],
    correctIndex: 3,
  },
  {
    id: "fld-linke-klammer",
    topic: "Feldermodell",
    stem: "Was bildet im Aussagesatz die linke Satzklammer?",
    options: ["das finite (gebeugte) Verb", "das Subjekt", "das Partizip", "ein Komma"],
    correctIndex: 0,
  },
  {
    id: "fld-rechte-klammer",
    topic: "Feldermodell",
    stem: "Was bildet typischerweise die rechte Satzklammer?",
    options: [
      "das Subjekt",
      "infinite Verbteile wie Partizip oder Infinitiv",
      "die adverbiale Bestimmung",
      "der Artikel",
    ],
    correctIndex: 1,
  },
];
