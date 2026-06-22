import type { McItem } from "@/lib/mc";

/** Optik — Farben & Sehen (Physik Klasse 7, Realschule BW). */
export const optFarben: McItem[] = [
  {
    id: "opt-spektrum",
    topic: "Optik",
    explanation:
      "Ein Prisma zerlegt weißes Licht in die Farben des Regenbogens – das nennt man Spektrum.",
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
    explanation: "Das Prisma zeigt: Weißes Licht besteht in Wirklichkeit aus vielen Farben.",
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
    explanation: "Weißes Licht ist eine Mischung aus allen Spektralfarben zusammen.",
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
    explanation:
      "Ein Regenbogen entsteht, wenn Sonnenlicht in winzigen Wassertropfen gebrochen und reflektiert wird.",
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
    explanation: "Ein roter Apfel wirft rotes Licht zurück und schluckt die anderen Farben.",
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
    explanation:
      "Ein Blatt reflektiert grünes Licht und schluckt den Rest – deshalb sieht es grün aus.",
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
    explanation: "Der Himmel ist blau, weil blaues Licht in der Luft am stärksten gestreut wird.",
    stem: "Welche Farbe des Sonnenlichts wird in der Luft am stärksten gestreut?",
    options: ["Rot", "Grün", "Blau", "Gelb"],
    correctIndex: 2,
  },
  {
    id: "opt-schwarz",
    topic: "Optik",
    explanation:
      "Schwarz erscheint ein Körper, der fast das gesamte Licht schluckt und kaum etwas zurückwirft.",
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
