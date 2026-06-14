import type { McItem } from "@/lib/mc";

/** Akustik — Tonhöhe, Lautstärke (Physik Klasse 7, Realschule BW). */
export const akuTon: McItem[] = [
  {
    id: "aku-frequenz-tonhoehe",
    topic: "Akustik",
    stem: "Wovon hängt die Tonhöhe eines Schalls ab?",
    options: ["von der Amplitude", "von der Frequenz", "von der Lautstärke", "von der Farbe"],
    correctIndex: 1,
  },
  {
    id: "aku-hohe-frequenz",
    topic: "Akustik",
    stem: "Ein Ton mit hoher Frequenz klingt …",
    options: ["tief", "hoch", "leise", "laut"],
    correctIndex: 1,
  },
  {
    id: "aku-tiefe-frequenz",
    topic: "Akustik",
    stem: "Ein Ton mit niedriger Frequenz klingt …",
    options: ["hoch", "tief", "laut", "leise"],
    correctIndex: 1,
  },
  {
    id: "aku-amplitude-lautstaerke",
    topic: "Akustik",
    stem: "Wovon hängt die Lautstärke eines Tons ab?",
    options: [
      "von der Frequenz",
      "von der Amplitude (Schwingungsweite)",
      "von der Tonhöhe",
      "von der Temperatur",
    ],
    correctIndex: 1,
  },
  {
    id: "aku-amplitude-gross",
    topic: "Akustik",
    stem: "Was bedeutet eine große Amplitude (Schwingungsweite)?",
    options: ["ein hoher Ton", "ein lauter Ton", "ein tiefer Ton", "gar kein Ton"],
    correctIndex: 1,
  },
  {
    id: "aku-saite",
    topic: "Akustik",
    stem: "Wie wird der Ton einer Gitarrensaite höher?",
    options: [
      "wenn die Saite kürzer oder straffer schwingt",
      "wenn man leiser zupft",
      "wenn die Saite dicker wird",
      "wenn man lauter zupft",
    ],
    correctIndex: 0,
  },
  {
    id: "aku-frequenz-einheit",
    topic: "Akustik",
    stem: "In welcher Einheit gibt man die Frequenz an?",
    options: ["Meter (m)", "Hertz (Hz)", "Sekunde (s)", "Dezibel (dB)"],
    correctIndex: 1,
  },
  {
    id: "aku-hertz-bedeutung",
    topic: "Akustik",
    stem: "Was bedeutet eine Frequenz von 50 Hz?",
    options: [
      "50 Schwingungen pro Sekunde",
      "50 Meter pro Sekunde",
      "50 verschiedene Töne",
      "eine Lautstärke von 50",
    ],
    correctIndex: 0,
  },
  {
    id: "aku-lautstaerke-einheit",
    topic: "Akustik",
    stem: "In welcher Einheit gibt man den Schallpegel (die Lautstärke) an?",
    options: ["Hertz", "Dezibel (dB)", "Meter", "Watt"],
    correctIndex: 1,
  },
];
