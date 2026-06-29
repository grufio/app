import type { McItem } from "@/lib/mc";

/** Akustik — Schall & Ausbreitung (Physik Klasse 7, Realschule BW). */
export const akuSchall: McItem[] = [
  {
    id: "aku-schwingung",
    topic: "Akustik",
    explanation:
      "Schall entsteht, wenn ein Körper schwingt – zum Beispiel eine Saite oder eine Lautsprechermembran.",
    stem: "Wie entsteht Schall?",
    options: ["Durch schwingende Körper", "Durch Licht", "Durch Wärme", "Durch Magnetismus"],
    correctIndex: 0,
  },
  {
    id: "aku-quelle",
    topic: "Akustik",
    explanation: "An jeder Schallquelle schwingt oder vibriert etwas, solange sie tönt.",
    stem: "Was kann man an jeder Schallquelle beobachten?",
    options: ["Sie leuchtet", "Etwas schwingt oder vibriert", "Sie wird kalt", "Sie zieht Eisen an"],
    correctIndex: 1,
  },
  {
    id: "aku-medium",
    topic: "Akustik",
    explanation:
      "Schall braucht einen Stoff zum Ausbreiten – meist die Luft. Ohne Teilchen funktioniert es nicht.",
    stem: "Was braucht der Schall, um sich auszubreiten?",
    options: ["nichts", "ein Vakuum", "einen Stoff (z. B. Luft)", "nur Licht"],
    correctIndex: 2,
  },
  {
    id: "aku-vakuum",
    topic: "Akustik",
    explanation:
      "Im Vakuum gibt es keine Teilchen, die schwingen könnten – darum breitet sich dort kein Schall aus.",
    stem: "Warum breitet sich Schall im Vakuum nicht aus?",
    options: [
      "Weil es dort zu kalt ist",
      "Weil es keine Teilchen gibt, die schwingen können",
      "Weil Licht den Schall überlagert",
      "Weil die Schwerkraft fehlt",
    ],
    correctIndex: 1,
  },
  {
    id: "aku-vakuumglocke",
    topic: "Akustik",
    explanation:
      "Pumpt man die Luft aus der Glasglocke, fehlen die Teilchen – die Klingel wird immer leiser.",
    stem: "Eine klingelnde Glocke steht in einer Glasglocke, aus der die Luft gepumpt wird. Was passiert?",
    options: [
      "Man hört die Klingel lauter",
      "Man hört die Klingel immer leiser, bis fast nichts mehr",
      "Man sieht kein Licht mehr",
      "Die Glocke wird warm",
    ],
    correctIndex: 1,
  },
  {
    id: "aku-geschwindigkeit-luft",
    topic: "Akustik",
    explanation: "In Luft ist Schall etwa 340 Meter pro Sekunde schnell – viel langsamer als Licht.",
    stem: "Wie schnell breitet sich Schall in Luft ungefähr aus?",
    options: ["340 m/s", "30 m/s", "300000 km/s", "3 m/s"],
    correctIndex: 0,
  },
  {
    id: "aku-medium-vergleich",
    topic: "Akustik",
    explanation: "In festen Stoffen wie Stahl ist der Schall schneller als in Wasser oder Luft.",
    stem: "In welchem Stoff ist der Schall am schnellsten?",
    options: ["in Luft", "in Wasser", "in Stahl (Festkörper)", "im Vakuum"],
    correctIndex: 2,
  },
  {
    id: "aku-schall-festkoerper",
    topic: "Akustik",
    explanation:
      "Weil Schall im Festkörper (der Schiene) schneller ist als in Luft, hört man den Zug früher.",
    stem: "Legt man das Ohr an eine Schiene, hört man einen herannahenden Zug früher. Warum?",
    options: [
      "Im Festkörper ist der Schall schneller als in der Luft",
      "Im Festkörper ist der Schall langsamer",
      "Metall erzeugt selbst Schall",
      "Schienen verstärken das Licht",
    ],
    correctIndex: 0,
  },
  {
    id: "aku-echo",
    topic: "Akustik",
    explanation: "Trifft Schall auf eine Wand, wird er zurückgeworfen (reflektiert) – das ist das Echo.",
    stem: "Wie entsteht ein Echo?",
    options: [
      "Schall wird an einer Wand zurückgeworfen (reflektiert)",
      "Schall wird gebrochen",
      "Schall wird vollständig verschluckt",
      "Licht erzeugt den Ton",
    ],
    correctIndex: 0,
  },
  {
    id: "aku-gewitter",
    topic: "Akustik",
    explanation:
      "Licht ist viel schneller als Schall: Den Blitz sieht man sofort, den Donner erst später.",
    stem: "Warum hört man den Donner erst nach dem Blitz?",
    options: [
      "Weil Licht viel schneller ist als Schall",
      "Weil Schall schneller ist als Licht",
      "Weil der Donner später entsteht",
      "Weil das Ohr langsam reagiert",
    ],
    correctIndex: 0,
  },
  {
    id: "aku-ausbreitung-richtung",
    topic: "Akustik",
    explanation: "Schall breitet sich von der Quelle in alle Richtungen aus.",
    stem: "Wie breitet sich Schall von einer Quelle aus?",
    options: ["nur nach oben", "in alle Richtungen", "nur geradeaus nach vorne", "gar nicht"],
    correctIndex: 1,
  },
];
