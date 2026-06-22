import type { McItem } from "@/lib/mc";

/** Optik — Reflexion & Spiegel (Physik Klasse 7, Realschule BW). */
export const optSpiegel: McItem[] = [
  {
    id: "opt-reflexionsgesetz",
    topic: "Optik",
    explanation:
      "Trifft Licht auf einen ebenen Spiegel, wird es zurückgeworfen. Dabei ist der Einfallswinkel genauso groß wie der Reflexionswinkel.",
    stem: "Was gilt bei der Reflexion an einem ebenen Spiegel?",
    options: [
      "Einfallswinkel größer als Reflexionswinkel",
      "Einfallswinkel = Reflexionswinkel",
      "Einfallswinkel kleiner als Reflexionswinkel",
      "Der Winkel spielt keine Rolle",
    ],
    correctIndex: 1,
  },
  {
    id: "opt-winkel",
    topic: "Optik",
    explanation:
      "Einfalls- und Reflexionswinkel sind immer gleich groß. Beide werden vom Lot aus gemessen.",
    stem: "Licht trifft mit 30° Einfallswinkel (zum Lot) auf einen ebenen Spiegel. Wie groß ist der Reflexionswinkel?",
    options: ["15°", "30°", "60°", "90°"],
    correctIndex: 1,
  },
  {
    id: "opt-einfallswinkel-null",
    topic: "Optik",
    explanation:
      "Trifft Licht senkrecht (Einfallswinkel 0°) auf den Spiegel, wird es genau in sich zurückgeworfen.",
    stem: "Licht trifft senkrecht (Einfallswinkel 0°) auf einen Spiegel. Wohin wird es reflektiert?",
    options: ["genau in sich zurück", "um 90° zur Seite", "gar nicht", "im Kreis"],
    correctIndex: 0,
  },
  {
    id: "opt-lot",
    topic: "Optik",
    explanation:
      "Das Lot ist die gedachte Senkrechte zur Spiegelfläche im Auftreffpunkt. Von ihm aus misst man die Winkel.",
    stem: "Von welcher Linie aus misst man Einfalls- und Reflexionswinkel?",
    options: [
      "Von der Spiegelfläche",
      "Vom Lichtstrahl selbst",
      "Vom Lot (senkrecht zur Fläche)",
      "Vom Boden",
    ],
    correctIndex: 2,
  },
  {
    id: "opt-gerichtete-reflexion",
    topic: "Optik",
    explanation:
      "An einer glatten Fläche wird Licht ordentlich in eine Richtung zurückgeworfen – das heißt gerichtete Reflexion.",
    stem: "Wie nennt man die Reflexion an einer glatten Spiegelfläche?",
    options: ["gerichtete Reflexion", "Streuung", "Brechung", "Beugung"],
    correctIndex: 0,
  },
  {
    id: "opt-streuung",
    topic: "Optik",
    explanation:
      "Raue Flächen wie Papier streuen das Licht in alle Richtungen, ein Spiegel wirft es gerichtet zurück.",
    stem: "Warum kann man ein Blatt Papier von allen Seiten sehen, einen Spiegel aber nicht?",
    options: [
      "Papier streut das Licht in alle Richtungen, der Spiegel reflektiert gerichtet",
      "Papier ist eine Lichtquelle",
      "Der Spiegel verschluckt das Licht",
      "Papier bricht das Licht",
    ],
    correctIndex: 0,
  },
  {
    id: "opt-spiegelbild",
    topic: "Optik",
    explanation: "Das Bild im ebenen Spiegel ist gleich groß, aufrecht und seitenverkehrt.",
    stem: "Wie ist das Bild in einem ebenen Spiegel?",
    options: [
      "kleiner und auf dem Kopf",
      "gleich groß, aufrecht, seitenverkehrt",
      "vergrößert und farbig",
      "unscharf",
    ],
    correctIndex: 1,
  },
  {
    id: "opt-spiegel-bildweite",
    topic: "Optik",
    explanation:
      "Das Spiegelbild scheint genauso weit hinter dem Spiegel zu liegen, wie der Gegenstand davor steht.",
    stem: "Wie weit scheint das Spiegelbild hinter dem ebenen Spiegel zu liegen?",
    options: [
      "genauso weit, wie der Gegenstand davor steht",
      "doppelt so weit",
      "halb so weit",
      "direkt auf der Spiegelfläche",
    ],
    correctIndex: 0,
  },
  {
    id: "opt-spiegelschrift",
    topic: "Optik",
    explanation:
      "Weil der Spiegel das Bild an seiner Fläche umklappt, erscheint Schrift seitenverkehrt.",
    stem: "Warum erscheint Schrift im Spiegel seitenverkehrt?",
    options: [
      "weil der Spiegel das Bild an der Spiegelfläche umklappt",
      "weil Licht gebrochen wird",
      "weil der Spiegel die Schrift dreht",
      "weil sich das Auge täuscht",
    ],
    correctIndex: 0,
  },
  {
    id: "opt-periskop",
    topic: "Optik",
    explanation:
      "Mit zwei Spiegeln kann man in einem Periskop über eine Mauer oder um eine Ecke schauen.",
    stem: "Womit kann man in einem Periskop über eine Mauer schauen?",
    options: ["mit zwei Spiegeln", "mit einer Lupe", "mit einem Prisma allein", "mit einer Lichtquelle"],
    correctIndex: 0,
  },
];
