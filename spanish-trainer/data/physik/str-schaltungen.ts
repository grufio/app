import type { McItem } from "@/lib/mc";

/** Elektrischer Stromkreis — Schaltungen (Physik Klasse 7, Realschule BW). */
export const strSchaltungen: McItem[] = [
  {
    id: "str-reihenschaltung",
    topic: "Stromkreis",
    stem: "Was passiert in einer Reihenschaltung, wenn eine von zwei Lampen herausgedreht wird?",
    options: [
      "die andere Lampe leuchtet weiter",
      "auch die andere Lampe geht aus",
      "die andere Lampe leuchtet heller",
      "es passiert gar nichts",
    ],
    correctIndex: 1,
  },
  {
    id: "str-reihe-lichterkette",
    topic: "Stromkreis",
    stem: "Bei einer einfachen Reihen-Lichterkette geht eine Lampe kaputt. Was passiert?",
    options: [
      "nur diese eine Lampe bleibt dunkel",
      "die ganze Kette bleibt dunkel",
      "die Kette leuchtet heller",
      "es passiert nichts",
    ],
    correctIndex: 1,
  },
  {
    id: "str-parallel",
    topic: "Stromkreis",
    stem: "Was passiert in einer Parallelschaltung, wenn eine von zwei Lampen herausgedreht wird?",
    options: [
      "alle Lampen gehen aus",
      "die andere Lampe leuchtet weiter",
      "es entsteht ein Kurzschluss",
      "die Batterie lädt sich auf",
    ],
    correctIndex: 1,
  },
  {
    id: "str-parallel-haushalt",
    topic: "Stromkreis",
    stem: "Warum sind die Lampen in einer Wohnung parallel geschaltet?",
    options: [
      "damit jede Lampe einzeln an- und ausgehen kann",
      "damit alle zusammen ausgehen",
      "um Strom zu erzeugen",
      "damit sie dunkler leuchten",
    ],
    correctIndex: 0,
  },
  {
    id: "str-reihe-helligkeit",
    topic: "Stromkreis",
    stem: "Zwei gleiche Lampen in Reihe an einer Batterie leuchten …",
    options: [
      "heller als eine einzelne Lampe",
      "dunkler als eine einzelne Lampe",
      "gar nicht",
      "abwechselnd",
    ],
    correctIndex: 1,
  },
  {
    id: "str-und-schaltung",
    topic: "Stromkreis",
    stem: "Bei einer UND-Schaltung leuchtet die Lampe, wenn …",
    options: [
      "beide Schalter geschlossen sind",
      "mindestens ein Schalter geschlossen ist",
      "alle Schalter offen sind",
      "gar kein Schalter vorhanden ist",
    ],
    correctIndex: 0,
  },
  {
    id: "str-oder-schaltung",
    topic: "Stromkreis",
    stem: "Bei einer ODER-Schaltung leuchtet die Lampe, wenn …",
    options: [
      "beide Schalter geschlossen sein müssen",
      "mindestens ein Schalter geschlossen ist",
      "kein Schalter geschlossen ist",
      "die Batterie leer ist",
    ],
    correctIndex: 1,
  },
  {
    id: "str-schaltzeichen",
    topic: "Stromkreis",
    stem: "Wofür stehen die Schaltzeichen in einem Schaltplan?",
    options: [
      "für Farben",
      "für die Bauteile (Lampe, Schalter, Quelle …)",
      "für die Lautstärke",
      "für die Temperatur",
    ],
    correctIndex: 1,
  },
  {
    id: "str-schaltplan-vorteil",
    topic: "Stromkreis",
    stem: "Wozu zeichnet man eine Schaltung als Schaltplan mit Schaltzeichen?",
    options: [
      "um sie übersichtlich und einheitlich darzustellen",
      "um sie bunter zu machen",
      "um Strom zu sparen",
      "um das Licht zu messen",
    ],
    correctIndex: 0,
  },
];
