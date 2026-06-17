import type { McItem } from "@/lib/mc";

/** Deutsch — Aktiv / Passiv (Das Verb: Aktiv und Passiv, Deutschbuch S. 298–299). */
export const aktivPassiv: McItem[] = [
  {
    id: "akt-aktiv-erkennen",
    topic: "Aktiv/Passiv",
    stem: "Steht „Der Hund beißt den Mann.“ im Aktiv oder im Passiv?",
    options: ["Aktiv", "Passiv", "Beides", "Weder noch"],
    correctIndex: 0,
  },
  {
    id: "akt-passiv-erkennen",
    topic: "Aktiv/Passiv",
    stem: "Steht „Der Mann wird vom Hund gebissen.“ im Aktiv oder im Passiv?",
    options: ["Aktiv", "Passiv", "Beides", "Weder noch"],
    correctIndex: 1,
  },
  {
    id: "akt-passiv-bildung",
    topic: "Aktiv/Passiv",
    stem: "Womit bildet man das Vorgangspassiv?",
    options: [
      "mit „haben“ + Partizip II",
      "mit „sein“ + Infinitiv",
      "mit „werden“ + Partizip II",
      "mit „werden“ + Infinitiv",
    ],
    correctIndex: 2,
  },
  {
    id: "akt-aktiv-fokus",
    topic: "Aktiv/Passiv",
    stem: "Worauf richtet das Aktiv den Blick?",
    options: [
      "auf die handelnde Person (den Täter)",
      "auf den Ort der Handlung",
      "auf die Handlung selbst, nicht auf den Täter",
      "auf die Zeit der Handlung",
    ],
    correctIndex: 0,
  },
  {
    id: "akt-umwandeln-passiv",
    topic: "Aktiv/Passiv",
    stem: "Wie lautet „Der Lehrer lobt den Schüler.“ im Passiv?",
    options: [
      "Der Schüler lobt den Lehrer.",
      "Der Schüler wird vom Lehrer gelobt.",
      "Der Lehrer wird vom Schüler gelobt.",
      "Der Schüler hat den Lehrer gelobt.",
    ],
    correctIndex: 1,
  },
  {
    id: "akt-praeposition-urheber",
    topic: "Aktiv/Passiv",
    stem: "Mit welcher Präposition nennt man im Passiv den Urheber (die handelnde Person)?",
    options: ["mit", "bei", "von", "durch"],
    correctIndex: 2,
  },
  {
    id: "akt-welcher-passiv",
    topic: "Aktiv/Passiv",
    stem: "Welcher Satz steht im Passiv?",
    options: [
      "Anna malt ein Bild.",
      "Anna malt gern bunte Bilder.",
      "Anna hat ein Bild gemalt.",
      "Das Bild wird gemalt.",
    ],
    correctIndex: 3,
  },
  {
    id: "akt-umwandeln-aktiv",
    topic: "Aktiv/Passiv",
    stem: "Wie lautet „Die Vase wird von Lena zerbrochen.“ im Aktiv?",
    options: [
      "Lena zerbricht die Vase.",
      "Die Vase zerbricht Lena.",
      "Lena wird von der Vase zerbrochen.",
      "Die Vase ist zerbrochen.",
    ],
    correctIndex: 0,
  },
  {
    id: "akt-warum-passiv",
    topic: "Aktiv/Passiv",
    stem: "Warum verwendet man oft das Passiv?",
    options: [
      "weil es kürzer klingt",
      "wenn der Handelnde unwichtig oder unbekannt ist",
      "um die Zeitform zu betonen",
      "weil es immer höflicher ist",
    ],
    correctIndex: 1,
  },
  {
    id: "akt-unpersoenlich",
    topic: "Aktiv/Passiv",
    stem: "Steht „Hier wird nicht geraucht.“ im Aktiv oder im Passiv?",
    options: ["Aktiv", "Passiv", "Weder noch", "Beides zugleich"],
    correctIndex: 1,
  },
  {
    id: "akt-praeposition-mittel",
    topic: "Aktiv/Passiv",
    stem: "Mit welcher Präposition nennt man im Passiv das Mittel oder die Ursache?",
    options: ["von", "durch", "mit", "bei"],
    correctIndex: 1,
  },
  {
    id: "akt-welcher-aktiv",
    topic: "Aktiv/Passiv",
    stem: "Welcher Satz steht im Aktiv?",
    options: [
      "Das Tor wird geschlossen.",
      "Das Tor wurde geschlossen.",
      "Der Hausmeister schließt das Tor.",
      "Hier wird abgeschlossen.",
    ],
    correctIndex: 2,
  },
];
