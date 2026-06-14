import type { McItem } from "@/lib/mc";

/** Akustik — Schall & Ausbreitung (Physik Klasse 7, Realschule BW). */
export const akuSchall: McItem[] = [
  {
    id: "aku-schwingung",
    topic: "Akustik",
    stem: "Wie entsteht Schall?",
    options: ["Durch schwingende Körper", "Durch Licht", "Durch Wärme", "Durch Magnetismus"],
    correctIndex: 0,
  },
  {
    id: "aku-quelle",
    topic: "Akustik",
    stem: "Was kann man an jeder Schallquelle beobachten?",
    options: ["Sie leuchtet", "Etwas schwingt oder vibriert", "Sie wird kalt", "Sie zieht Eisen an"],
    correctIndex: 1,
  },
  {
    id: "aku-medium",
    topic: "Akustik",
    stem: "Was braucht der Schall, um sich auszubreiten?",
    options: ["nichts", "ein Vakuum", "einen Stoff (z. B. Luft)", "nur Licht"],
    correctIndex: 2,
  },
  {
    id: "aku-vakuum",
    topic: "Akustik",
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
    stem: "Wie schnell breitet sich Schall in Luft ungefähr aus?",
    options: ["340 m/s", "30 m/s", "300000 km/s", "3 m/s"],
    correctIndex: 0,
  },
  {
    id: "aku-medium-vergleich",
    topic: "Akustik",
    stem: "In welchem Stoff ist der Schall am schnellsten?",
    options: ["in Luft", "in Wasser", "in Stahl (Festkörper)", "im Vakuum"],
    correctIndex: 2,
  },
  {
    id: "aku-schall-festkoerper",
    topic: "Akustik",
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
    stem: "Wie breitet sich Schall von einer Quelle aus?",
    options: ["nur nach oben", "in alle Richtungen", "nur geradeaus nach vorne", "gar nicht"],
    correctIndex: 1,
  },
];
