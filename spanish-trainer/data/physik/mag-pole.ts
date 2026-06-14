import type { McItem } from "@/lib/mc";

/** Magnetismus — Magnete & Pole (Physik Klasse 7, Realschule BW). */
export const magPole: McItem[] = [
  {
    id: "mag-pole",
    topic: "Magnetismus",
    stem: "Wie heißen die beiden Pole eines Magneten?",
    options: ["Plus- und Minuspol", "Nord- und Südpol", "oberer und unterer Pol", "warmer und kalter Pol"],
    correctIndex: 1,
  },
  {
    id: "mag-anziehung",
    topic: "Magnetismus",
    stem: "Welche Magnetpole ziehen sich an?",
    options: [
      "gleiche Pole",
      "ungleiche Pole (Nord und Süd)",
      "nur zwei Nordpole",
      "Pole ziehen sich nie an",
    ],
    correctIndex: 1,
  },
  {
    id: "mag-abstossung",
    topic: "Magnetismus",
    stem: "Was passiert, wenn man zwei Nordpole zusammenbringt?",
    options: ["sie ziehen sich an", "sie stoßen sich ab", "es passiert nichts", "sie werden warm"],
    correctIndex: 1,
  },
  {
    id: "mag-dauermagnet",
    topic: "Magnetismus",
    stem: "Was ist ein Dauermagnet?",
    options: [
      "ein Magnet, der ständig magnetisch ist",
      "ein Magnet, der Strom braucht",
      "ein Magnet aus Holz",
      "ein Magnet, der nur kurz wirkt",
    ],
    correctIndex: 0,
  },
  {
    id: "mag-stoffe",
    topic: "Magnetismus",
    stem: "Welches Material wird von einem Magneten angezogen?",
    options: ["Holz", "Eisen", "Kupfer", "Glas"],
    correctIndex: 1,
  },
  {
    id: "mag-ferromagnetisch",
    topic: "Magnetismus",
    stem: "Welche Metalle sind magnetisch (ferromagnetisch)?",
    options: [
      "Eisen, Nickel und Cobalt",
      "Gold, Silber und Kupfer",
      "Aluminium, Zinn und Blei",
      "alle Metalle",
    ],
    correctIndex: 0,
  },
  {
    id: "mag-nicht",
    topic: "Magnetismus",
    stem: "Welcher Stoff wird NICHT von einem Magneten angezogen?",
    options: ["Eisen", "Nickel", "Aluminium", "Cobalt"],
    correctIndex: 2,
  },
  {
    id: "mag-staerkste",
    topic: "Magnetismus",
    stem: "Wo ist die magnetische Wirkung eines Stabmagneten am stärksten?",
    options: ["in der Mitte", "an den Polen", "überall gleich", "nur am Nordpol"],
    correctIndex: 1,
  },
  {
    id: "mag-teilen",
    topic: "Magnetismus",
    stem: "Was passiert, wenn man einen Stabmagneten in der Mitte zerbricht?",
    options: [
      "man erhält einen einzelnen Nord- und einen einzelnen Südpol",
      "jedes Teilstück hat wieder Nord- und Südpol",
      "der Magnetismus verschwindet ganz",
      "es entstehen zwei Nordpole",
    ],
    correctIndex: 1,
  },
  {
    id: "mag-anwendung",
    topic: "Magnetismus",
    stem: "Wo wird ein Magnet im Alltag genutzt?",
    options: [
      "als Lichtquelle",
      "als Verschluss an einer Schranktür",
      "als Stromquelle",
      "als Wärmequelle",
    ],
    correctIndex: 1,
  },
];
