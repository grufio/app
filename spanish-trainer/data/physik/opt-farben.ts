import type { McItem } from "@/lib/mc";

/** Optik — Farben & Sehen (Physik Klasse 7, Realschule BW). */
export const optFarben: McItem[] = [
  {
    id: "opt-spektrum",
    topic: "Optik",
    stem: "Was passiert, wenn weißes Licht durch ein Prisma fällt?",
    options: [
      "Es wird einfach heller",
      "Es wird in die Farben des Regenbogens zerlegt",
      "Es verschwindet",
      "Es wird vollständig zu rotem Licht",
    ],
    correctIndex: 1,
  },
  {
    id: "opt-prisma",
    topic: "Optik",
    stem: "Welche Eigenschaft des Lichts zeigt ein Prisma?",
    options: [
      "dass Licht magnetisch ist",
      "dass weißes Licht aus vielen Farben besteht",
      "dass Licht Schall erzeugt",
      "dass Licht schwarz ist",
    ],
    correctIndex: 1,
  },
  {
    id: "opt-weisses-licht-mischung",
    topic: "Optik",
    stem: "Woraus besteht weißes Licht?",
    options: [
      "nur aus gelbem Licht",
      "aus allen Spektralfarben zusammen",
      "aus Schwarz und Weiß",
      "aus rotem Licht allein",
    ],
    correctIndex: 1,
  },
  {
    id: "opt-regenbogen",
    topic: "Optik",
    stem: "Wodurch entsteht ein Regenbogen?",
    options: [
      "durch Brechung und Reflexion des Sonnenlichts in Wassertropfen",
      "durch Spiegelung an Wolken",
      "durch den Schatten der Sonne",
      "durch farbige Luft",
    ],
    correctIndex: 0,
  },
  {
    id: "opt-rotes-objekt",
    topic: "Optik",
    stem: "Warum erscheint ein Apfel rot?",
    options: [
      "er reflektiert rotes Licht und schluckt die anderen Farben",
      "er sendet selbst rotes Licht aus",
      "er bricht das Licht",
      "er spiegelt alle Farben gleich",
    ],
    correctIndex: 0,
  },
  {
    id: "opt-gruenes-blatt",
    topic: "Optik",
    stem: "Warum sieht ein Blatt im Sonnenlicht grün aus?",
    options: [
      "es reflektiert grünes Licht, den Rest schluckt es",
      "es erzeugt selbst grünes Licht",
      "es bricht nur grünes Licht",
      "es ist mit grünem Licht beleuchtet",
    ],
    correctIndex: 0,
  },
  {
    id: "opt-himmel-blau",
    topic: "Optik",
    stem: "Welche Farbe des Sonnenlichts wird in der Luft am stärksten gestreut?",
    options: ["Rot", "Grün", "Blau", "Gelb"],
    correctIndex: 2,
  },
  {
    id: "opt-schwarz",
    topic: "Optik",
    stem: "Warum erscheint ein Gegenstand schwarz?",
    options: [
      "er schluckt fast das gesamte Licht",
      "er reflektiert alles Licht",
      "er sendet schwarzes Licht aus",
      "er bricht das Licht stark",
    ],
    correctIndex: 0,
  },
];
