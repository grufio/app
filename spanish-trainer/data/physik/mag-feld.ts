import type { McItem } from "@/lib/mc";

/** Magnetismus — Magnetfeld & Kompass (Physik Klasse 7, Realschule BW). */
export const magFeld: McItem[] = [
  {
    id: "mag-feld",
    topic: "Magnetismus",
    stem: "Wie nennt man den Bereich um einen Magneten, in dem er wirkt?",
    options: ["das Magnetfeld", "der Schatten", "das Schwerefeld", "der Stromkreis"],
    correctIndex: 0,
  },
  {
    id: "mag-feldlinien",
    topic: "Magnetismus",
    stem: "Womit kann man ein Magnetfeld sichtbar machen?",
    options: ["mit Wasser", "mit Eisenspänen", "mit einer Lampe", "mit einem Spiegel"],
    correctIndex: 1,
  },
  {
    id: "mag-feldlinien-richtung",
    topic: "Magnetismus",
    stem: "Wie verlaufen die Feldlinien außerhalb eines Magneten?",
    options: [
      "vom Nordpol zum Südpol",
      "vom Südpol zum Nordpol",
      "im Kreis um die Mitte",
      "sie verlaufen gar nicht",
    ],
    correctIndex: 0,
  },
  {
    id: "mag-feldlinien-dichte",
    topic: "Magnetismus",
    stem: "Wo liegen die Feldlinien eines Magneten am dichtesten?",
    options: ["an den Polen", "in der Mitte", "weit weg vom Magneten", "überall gleich"],
    correctIndex: 0,
  },
  {
    id: "mag-kompass",
    topic: "Magnetismus",
    stem: "Worauf reagiert eine Kompassnadel?",
    options: ["auf das Magnetfeld der Erde", "auf das Licht", "auf die Wärme", "auf den Schall"],
    correctIndex: 0,
  },
  {
    id: "mag-kompass-richtung",
    topic: "Magnetismus",
    stem: "Wohin zeigt der Nordpol einer Kompassnadel?",
    options: ["nach Süden", "ungefähr zum geografischen Norden", "nach oben", "immer zur Sonne"],
    correctIndex: 1,
  },
  {
    id: "mag-kompass-nutzen",
    topic: "Magnetismus",
    stem: "Wozu benutzt man einen Kompass?",
    options: [
      "um die Zeit zu messen",
      "um die Himmelsrichtung zu finden",
      "um Gewicht zu bestimmen",
      "um Töne zu erzeugen",
    ],
    correctIndex: 1,
  },
  {
    id: "mag-erdmagnetfeld",
    topic: "Magnetismus",
    stem: "Die Erde wirkt wie …",
    options: ["ein riesiger Magnet", "eine große Lampe", "ein Spiegel", "eine Linse"],
    correctIndex: 0,
  },
  {
    id: "mag-erde-schutz",
    topic: "Magnetismus",
    stem: "Was lenkt einen Teil der geladenen Teilchen von der Sonne von der Erde ab?",
    options: ["das Magnetfeld der Erde", "das Schwerefeld", "der Mond", "die Wolken"],
    correctIndex: 0,
  },
];
