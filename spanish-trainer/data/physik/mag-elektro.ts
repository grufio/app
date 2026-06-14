import type { McItem } from "@/lib/mc";

/** Magnetismus — Elektromagnetismus (Physik Klasse 7, Realschule BW). */
export const magElektro: McItem[] = [
  {
    id: "mag-strom-magnetfeld",
    topic: "Magnetismus",
    stem: "Was entsteht um einen Draht, durch den Strom fließt?",
    options: ["ein Magnetfeld", "ein Schatten", "ein Schallfeld", "gar nichts"],
    correctIndex: 0,
  },
  {
    id: "mag-spule-strom",
    topic: "Magnetismus",
    stem: "Wann ist eine Spule magnetisch?",
    options: ["immer", "wenn Strom durch sie fließt", "nur im Dunkeln", "wenn sie warm wird"],
    correctIndex: 1,
  },
  {
    id: "mag-elektromagnet",
    topic: "Magnetismus",
    stem: "Wie kann man einen Elektromagneten herstellen?",
    options: [
      "mit einem Spiegel",
      "mit einer stromdurchflossenen Spule",
      "mit einer Batterie allein",
      "mit warmem Wasser",
    ],
    correctIndex: 1,
  },
  {
    id: "mag-eisenkern",
    topic: "Magnetismus",
    stem: "Womit verstärkt man das Magnetfeld einer Spule?",
    options: ["mit einem Glasstab", "mit einem Eisenkern", "mit einem Gummikern", "mit Wasser"],
    correctIndex: 1,
  },
  {
    id: "mag-elektromagnet-staerker",
    topic: "Magnetismus",
    stem: "Wie wird ein Elektromagnet stärker?",
    options: [
      "mit weniger Strom",
      "mit mehr Windungen und mehr Strom",
      "mit einem kürzeren Draht ohne Strom",
      "mit einem Holzkern",
    ],
    correctIndex: 1,
  },
  {
    id: "mag-elektromagnet-vorteil",
    topic: "Magnetismus",
    stem: "Welchen Vorteil hat ein Elektromagnet gegenüber einem Dauermagneten?",
    options: [
      "man kann ihn ein- und ausschalten",
      "er ist immer eingeschaltet",
      "er braucht keinen Strom",
      "er besteht aus Holz",
    ],
    correctIndex: 0,
  },
  {
    id: "mag-elektromagnet-kran",
    topic: "Magnetismus",
    stem: "Warum nutzt ein Schrottplatz-Kran einen Elektromagneten?",
    options: [
      "weil man ihn ein- und ausschalten kann, um Eisen zu heben und wieder loszulassen",
      "weil er leuchtet",
      "weil er leiser ist",
      "weil er gar kein Eisen anzieht",
    ],
    correctIndex: 0,
  },
  {
    id: "mag-magnetisieren",
    topic: "Magnetismus",
    stem: "Wie kann man einen Eisennagel magnetisieren?",
    options: [
      "ihn kräftig erhitzen",
      "ihn mehrmals in eine Richtung mit einem Magneten bestreichen",
      "ihn ins Wasser legen",
      "ihn bunt anmalen",
    ],
    correctIndex: 1,
  },
  {
    id: "mag-entmagnetisieren",
    topic: "Magnetismus",
    stem: "Wodurch kann ein Magnet seine Wirkung verlieren?",
    options: [
      "durch Abkühlen",
      "durch Dunkelheit",
      "durch starkes Erhitzen oder heftige Schläge",
      "er verliert sie nie",
    ],
    correctIndex: 2,
  },
];
