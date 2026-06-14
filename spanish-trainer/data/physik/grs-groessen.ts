import type { McItem } from "@/lib/mc";

/** Größen & Messen — Größen & Einheiten (Physik Klasse 7, Realschule BW). */
export const grsGroessen: McItem[] = [
  {
    id: "grs-groesse",
    topic: "Größen",
    stem: "Woraus besteht die Angabe einer physikalischen Größe?",
    options: [
      "nur aus einer Zahl",
      "aus Zahlenwert und Einheit",
      "nur aus einem Namen",
      "aus einer Farbe",
    ],
    correctIndex: 1,
  },
  {
    id: "grs-laenge-einheit",
    topic: "Größen",
    stem: "Welche Einheit gehört zur Größe Länge?",
    options: ["Sekunde", "Meter", "Kilogramm", "Ampere"],
    correctIndex: 1,
  },
  {
    id: "grs-zeit-einheit",
    topic: "Größen",
    stem: "Welche Einheit gehört zur Größe Zeit?",
    options: ["Meter", "Sekunde", "Gramm", "Volt"],
    correctIndex: 1,
  },
  {
    id: "grs-masse-einheit",
    topic: "Größen",
    stem: "Welche Einheit gehört zur Größe Masse?",
    options: ["Kilogramm", "Meter", "Sekunde", "Hertz"],
    correctIndex: 0,
  },
  {
    id: "grs-masse-bedeutung",
    topic: "Größen",
    stem: "Was gibt die Masse eines Körpers an?",
    options: [
      "wie viel Stoff der Körper enthält",
      "wie warm der Körper ist",
      "wie lang der Körper ist",
      "welche Farbe der Körper hat",
    ],
    correctIndex: 0,
  },
  {
    id: "grs-symbol-zeit",
    topic: "Größen",
    stem: "Welches Formelzeichen steht für die Zeit?",
    options: ["t", "m", "l", "v"],
    correctIndex: 0,
  },
  {
    id: "grs-symbol-masse",
    topic: "Größen",
    stem: "Welches Formelzeichen steht für die Masse?",
    options: ["t", "m", "s", "F"],
    correctIndex: 1,
  },
  {
    id: "grs-volumen",
    topic: "Größen",
    stem: "In welcher Einheit gibt man ein Volumen häufig an?",
    options: ["in Liter (l) oder cm³", "in Meter", "in Sekunden", "in Hertz"],
    correctIndex: 0,
  },
  {
    id: "grs-umrechnung-m-cm",
    topic: "Größen",
    stem: "Wie viele Zentimeter sind 1 Meter?",
    options: ["10 cm", "100 cm", "1000 cm", "1 cm"],
    correctIndex: 1,
  },
  {
    id: "grs-umrechnung-km-m",
    topic: "Größen",
    stem: "Wie viele Meter sind 1 Kilometer?",
    options: ["100 m", "1000 m", "10 m", "10000 m"],
    correctIndex: 1,
  },
  {
    id: "grs-umrechnung-kg-g",
    topic: "Größen",
    stem: "Wie viele Gramm sind 1 Kilogramm?",
    options: ["100 g", "1000 g", "10 g", "1 g"],
    correctIndex: 1,
  },
  {
    id: "grs-umrechnung-min-s",
    topic: "Größen",
    stem: "Wie viele Sekunden sind 1 Minute?",
    options: ["60 s", "100 s", "10 s", "360 s"],
    correctIndex: 0,
  },
];
