import type { McItem } from "@/lib/mc";

/** Optik — Licht, Schatten & Sehen (Physik Klasse 7, Realschule BW). */
export const optLicht: McItem[] = [
  {
    id: "opt-lichtquelle",
    topic: "Optik",
    explanation:
      "Lichtquellen erzeugen ihr Licht selbst – zum Beispiel Sonne, Lampe oder Feuer. Andere Körper sehen wir nur, weil sie Licht zurückwerfen.",
    stem: "Welcher dieser Körper ist eine Lichtquelle?",
    options: ["Der Mond", "Ein Spiegel", "Die Sonne", "Ein weißes Blatt Papier"],
    correctIndex: 2,
  },
  {
    id: "opt-mond-sehen",
    topic: "Optik",
    explanation:
      "Der Mond leuchtet nicht selbst. Wir sehen ihn nur, weil er das Licht der Sonne zurückwirft (reflektiert).",
    stem: "Warum können wir den Mond sehen?",
    options: [
      "Er ist eine eigene Lichtquelle",
      "Er reflektiert das Sonnenlicht",
      "Er sendet Wärmestrahlung aus",
      "Er leuchtet durch die Erdanziehung",
    ],
    correctIndex: 1,
  },
  {
    id: "opt-koerper-sehen",
    topic: "Optik",
    explanation:
      "Gegenstände, die nicht selbst leuchten, sehen wir nur, wenn sie Licht in unser Auge zurückwerfen.",
    stem: "Warum können wir einen nicht selbst leuchtenden Körper sehen?",
    options: [
      "Weil er Licht in unser Auge reflektiert",
      "Weil er Wärme abgibt",
      "Weil er schwingt",
      "Weil er magnetisch ist",
    ],
    correctIndex: 0,
  },
  {
    id: "opt-ausbreitung",
    topic: "Optik",
    explanation:
      "In einem klaren, gleichmäßigen Stoff breitet sich Licht immer geradlinig aus – also in geraden Linien.",
    stem: "Wie breitet sich Licht in einem klaren, gleichmäßigen Stoff aus?",
    options: ["in Wellenlinien", "geradlinig", "im Kreis", "zufällig um Ecken"],
    correctIndex: 1,
  },
  {
    id: "opt-geschwindigkeit",
    topic: "Optik",
    explanation:
      "Licht ist unglaublich schnell: rund 300 000 Kilometer in nur einer einzigen Sekunde.",
    stem: "Wie schnell ist das Licht im Vakuum ungefähr?",
    options: ["340 m/s", "3000 km/s", "300000 km/s", "300 km/h"],
    correctIndex: 2,
  },
  {
    id: "opt-schatten",
    topic: "Optik",
    explanation:
      "Ein Schatten entsteht, weil ein undurchsichtiger Körper das geradlinige Licht aufhält.",
    stem: "Wie entsteht ein Schatten?",
    options: [
      "Der Körper verschluckt Licht und sendet Dunkelheit aus",
      "Ein undurchsichtiger Körper hält das geradlinige Licht auf",
      "Licht wird am Körper gebrochen",
      "Der Boden zieht das Licht an",
    ],
    correctIndex: 1,
  },
  {
    id: "opt-kernschatten",
    topic: "Optik",
    explanation:
      "Im Kernschatten kommt gar kein Licht der Lichtquelle an – dort ist es am dunkelsten.",
    stem: "Was ist der Kernschatten?",
    options: [
      "Der Bereich mit halbem Licht",
      "Der hellste Bereich",
      "Der Bereich, den gar kein Licht der Quelle erreicht",
      "Der farbige Rand des Schattens",
    ],
    correctIndex: 2,
  },
  {
    id: "opt-halbschatten",
    topic: "Optik",
    explanation:
      "Ist die Lichtquelle ausgedehnt (kein einzelner Punkt), entsteht am Schattenrand ein helleres Halbschatten-Gebiet.",
    stem: "Ein Halbschatten entsteht, wenn …",
    options: [
      "die Lichtquelle ausgedehnt ist (kein Punkt)",
      "die Lichtquelle ein einziger Punkt ist",
      "kein Hindernis vorhanden ist",
      "das Licht gebrochen wird",
    ],
    correctIndex: 0,
  },
  {
    id: "opt-schatten-groesse",
    topic: "Optik",
    explanation: "Je näher ein Körper an der Lampe steht, desto größer wird sein Schatten.",
    stem: "Wie verändert sich der Schatten, wenn der Körper näher an die Lampe rückt?",
    options: ["Er wird größer", "Er wird kleiner", "Er verschwindet", "Er bleibt gleich"],
    correctIndex: 0,
  },
  {
    id: "opt-lochkamera",
    topic: "Optik",
    explanation:
      "In der Lochkamera fallen geradlinige Lichtstrahlen durch ein kleines Loch und bilden ein (umgekehrtes) Bild.",
    stem: "Wie entsteht das Bild in einer Lochkamera?",
    options: [
      "Durch eine Sammellinse",
      "Durch geradlinige Lichtstrahlen durch das kleine Loch",
      "Durch Spiegelung im Inneren",
      "Durch Brechung in einer Flüssigkeit",
    ],
    correctIndex: 1,
  },
  {
    id: "opt-mondphasen",
    topic: "Optik",
    explanation:
      "Wir sehen immer nur den von der Sonne beleuchteten Teil des Mondes – je nach Stellung mal mehr, mal weniger.",
    stem: "Wodurch entstehen die Mondphasen?",
    options: [
      "Durch den Erdschatten auf dem Mond",
      "Durch Wolken vor dem Mond",
      "Dadurch, dass wir verschieden beleuchtete Teile des Mondes sehen",
      "Weil der Mond selbst heller und dunkler leuchtet",
    ],
    correctIndex: 2,
  },
  {
    id: "opt-mondfinsternis",
    topic: "Optik",
    explanation: "Bei einer Mondfinsternis steht der Mond im Schatten der Erde.",
    stem: "Was geschieht bei einer Mondfinsternis?",
    options: [
      "Der Mond steht im Schatten der Erde",
      "Die Erde steht im Schatten des Mondes",
      "Der Mond steht zwischen Sonne und Erde",
      "Eine Wolke verdeckt den Mond",
    ],
    correctIndex: 0,
  },
  {
    id: "opt-sonnenfinsternis",
    topic: "Optik",
    explanation:
      "Bei einer Sonnenfinsternis schiebt sich der Mond zwischen Sonne und Erde und wirft seinen Schatten auf die Erde.",
    stem: "Was geschieht bei einer Sonnenfinsternis?",
    options: [
      "Die Erde steht zwischen Sonne und Mond",
      "Der Mond schiebt sich zwischen Sonne und Erde",
      "Die Sonne erlischt kurz",
      "Die Erde dreht sich schneller",
    ],
    correctIndex: 1,
  },
];
