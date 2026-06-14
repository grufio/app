import type { McItem } from "@/lib/mc";

/** Elektrischer Stromkreis — Grundlagen (Physik Klasse 7, Realschule BW). */
export const strGrundlagen: McItem[] = [
  {
    id: "str-geschlossen",
    topic: "Stromkreis",
    stem: "Wann fließt in einem Stromkreis ein elektrischer Strom?",
    options: [
      "wenn der Stromkreis geschlossen ist",
      "wenn der Stromkreis offen ist",
      "nur bei Tageslicht",
      "immer, auch ohne Quelle",
    ],
    correctIndex: 0,
  },
  {
    id: "str-bestandteile",
    topic: "Stromkreis",
    stem: "Was gehört zu einem einfachen Stromkreis?",
    options: [
      "Quelle, Leitung und Verbraucher",
      "nur eine Lampe",
      "nur ein einzelner Draht",
      "ein Magnet und ein Spiegel",
    ],
    correctIndex: 0,
  },
  {
    id: "str-quelle",
    topic: "Stromkreis",
    stem: "Welches Bauteil ist eine Stromquelle?",
    options: ["die Lampe", "der Schalter", "die Batterie", "der Draht"],
    correctIndex: 2,
  },
  {
    id: "str-batterie-pole",
    topic: "Stromkreis",
    stem: "Welche beiden Pole hat eine Batterie?",
    options: [
      "Pluspol und Minuspol",
      "Nordpol und Südpol",
      "heißer und kalter Pol",
      "linker und rechter Pol",
    ],
    correctIndex: 0,
  },
  {
    id: "str-verbraucher",
    topic: "Stromkreis",
    stem: "Welches Bauteil ist ein Verbraucher?",
    options: ["die Batterie", "die Lampe", "der Schalter", "die Leitung"],
    correctIndex: 1,
  },
  {
    id: "str-gluehlampe",
    topic: "Stromkreis",
    stem: "Welcher Teil einer Glühlampe leuchtet, wenn Strom fließt?",
    options: ["das Glas", "der dünne Glühdraht (Glühwendel)", "der Metallsockel", "die Luft darin"],
    correctIndex: 1,
  },
  {
    id: "str-schalter",
    topic: "Stromkreis",
    stem: "Wozu dient ein Schalter?",
    options: [
      "den Stromkreis öffnen und schließen",
      "Strom erzeugen",
      "Strom speichern",
      "Licht spiegeln",
    ],
    correctIndex: 0,
  },
  {
    id: "str-leiter",
    topic: "Stromkreis",
    stem: "Welcher Stoff leitet den elektrischen Strom gut?",
    options: ["Kupfer", "Glas", "Gummi", "trockenes Holz"],
    correctIndex: 0,
  },
  {
    id: "str-metall-leiter",
    topic: "Stromkreis",
    stem: "Warum bestehen Stromkabel innen aus Metall (z. B. Kupfer)?",
    options: [
      "weil Metall den Strom gut leitet",
      "weil Metall den Strom isoliert",
      "weil Metall durchsichtig ist",
      "weil Metall den Strom erzeugt",
    ],
    correctIndex: 0,
  },
  {
    id: "str-nichtleiter",
    topic: "Stromkreis",
    stem: "Welcher Stoff ist ein Nichtleiter (Isolator)?",
    options: ["Eisen", "Silber", "Kunststoff", "Aluminium"],
    correctIndex: 2,
  },
];
