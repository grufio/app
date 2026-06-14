import type { McItem } from "@/lib/mc";

/** Elektrischer Stromkreis — Wirkungen des Stroms & Sicherheit (Klasse 7, BW). */
export const strWirkungen: McItem[] = [
  {
    id: "str-wirkung-waerme",
    topic: "Stromkreis",
    stem: "Welche Wirkung des Stroms nutzt ein Toaster oder Tauchsieder?",
    options: ["die Lichtwirkung", "die Wärmewirkung", "die magnetische Wirkung", "gar keine"],
    correctIndex: 1,
  },
  {
    id: "str-wirkung-licht",
    topic: "Stromkreis",
    stem: "Welche Wirkungen des Stroms nutzt eine Glühlampe?",
    options: [
      "nur die magnetische Wirkung",
      "die Wärme- und die Lichtwirkung",
      "nur eine chemische Wirkung",
      "gar keine Wirkung",
    ],
    correctIndex: 1,
  },
  {
    id: "str-wirkung-magnet",
    topic: "Stromkreis",
    stem: "Welche Wirkung des Stroms nutzt ein Elektromagnet?",
    options: ["die Lichtwirkung", "die magnetische Wirkung", "die Wärmewirkung", "die Schallwirkung"],
    correctIndex: 1,
  },
  {
    id: "str-led",
    topic: "Stromkreis",
    stem: "Was ist eine LED?",
    options: [
      "ein Bauteil, das aus Strom Licht macht",
      "eine Stromquelle",
      "ein Schalter",
      "ein Dauermagnet",
    ],
    correctIndex: 0,
  },
  {
    id: "str-stromrichtung",
    topic: "Stromkreis",
    stem: "In welche Richtung zeigt die technische Stromrichtung im Stromkreis?",
    options: [
      "vom Pluspol zum Minuspol",
      "vom Minuspol zum Pluspol",
      "im Kreis um die Batterie",
      "mal so, mal so",
    ],
    correctIndex: 0,
  },
  {
    id: "str-kurzschluss",
    topic: "Stromkreis",
    stem: "Was ist ein Kurzschluss?",
    options: [
      "Strom fließt fast ohne Widerstand direkt von Plus nach Minus",
      "der Stromkreis ist offen",
      "die Lampe ist zu schwach",
      "die Batterie ist leer",
    ],
    correctIndex: 0,
  },
  {
    id: "str-kurzschluss-gefahr",
    topic: "Stromkreis",
    stem: "Warum ist ein Kurzschluss gefährlich?",
    options: [
      "es fließt ein sehr großer Strom, die Leitung wird heiß",
      "es fließt überhaupt kein Strom",
      "das Licht wird nur zu hell",
      "die Batterie wird kalt",
    ],
    correctIndex: 0,
  },
  {
    id: "str-sicherung",
    topic: "Stromkreis",
    stem: "Wozu dient eine Sicherung?",
    options: [
      "sie unterbricht den Stromkreis bei zu großem Strom",
      "sie erzeugt den Strom",
      "sie speichert den Strom",
      "sie macht das Licht heller",
    ],
    correctIndex: 0,
  },
  {
    id: "str-wasser-gefahr",
    topic: "Stromkreis",
    stem: "Warum ist elektrischer Strom in Verbindung mit Wasser besonders gefährlich?",
    options: [
      "Wasser isoliert den Strom",
      "Wasser leitet den Strom, der Körper ebenfalls",
      "Wasser löscht den Strom",
      "Wasser macht den Strom harmlos",
    ],
    correctIndex: 1,
  },
  {
    id: "str-sicherheit",
    topic: "Stromkreis",
    stem: "Warum darf man nicht mit einem Metallgegenstand in eine Steckdose fassen?",
    options: [
      "weil Metall den Strom in den Körper leitet",
      "weil Metall zu kalt ist",
      "weil Metall das Licht spiegelt",
      "weil dabei nichts passieren kann",
    ],
    correctIndex: 0,
  },
];
