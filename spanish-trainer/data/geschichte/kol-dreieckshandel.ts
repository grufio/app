import type { McItem } from "@/lib/mc";

/**
 * Geschichte — Der Dreieckshandel (transatlantischer Sklavenhandel).
 * Bewusst neutral formuliert („versklavte Menschen“, „Sklavenhandel“).
 */
export const kolDreieckshandel: McItem[] = [
  {
    id: "kol-drh-grund",
    topic: "Kolonialismus",
    explanation: "Weil die Zahl der Ureinwohner stark gesunken war, suchten die Kolonialherren nach neuen Arbeitskräften.",
    stem: "Warum suchten die Kolonialherren neue Arbeitskräfte?",
    options: [
      "weil die Zahl der Ureinwohner stark gesunken war",
      "weil die Europäer zu faul waren",
      "weil es keine Maschinen gab",
      "weil das Wetter zu heiß war",
    ],
    correctIndex: 0,
  },
  {
    id: "kol-drh-kontinente",
    topic: "Kolonialismus",
    explanation: "Der Dreieckshandel verband die drei Kontinente Europa, Afrika und Amerika.",
    stem: "Welche drei Kontinente verband der Dreieckshandel?",
    options: [
      "Europa, Asien und Australien",
      "Europa, Afrika und Amerika",
      "Afrika, Asien und Amerika",
      "Amerika, Asien und Europa",
    ],
    correctIndex: 1,
  },
  {
    id: "kol-drh-ozean",
    topic: "Kolonialismus",
    explanation: "Der Warenhandel des Dreieckshandels lief über den Atlantischen Ozean.",
    stem: "Über welchen Ozean lief der Dreieckshandel?",
    options: ["den Pazifik", "den Indischen Ozean", "den Atlantik", "das Mittelmeer"],
    correctIndex: 2,
  },
  {
    id: "kol-drh-waren-afrika",
    topic: "Kolonialismus",
    explanation: "Nach Afrika brachten die Europäer minderwertige Waren wie Glasperlen, alte Waffen und Alkohol.",
    stem: "Welche Waren brachten die Europäer nach Afrika?",
    options: [
      "Gold und Silber",
      "Maschinen und Bücher",
      "minderwertige Waren wie Glasperlen, alte Waffen und Alkohol",
      "Lebensmittel und Kleidung für alle",
    ],
    correctIndex: 2,
  },
  {
    id: "kol-drh-menschen",
    topic: "Kolonialismus",
    explanation: "Von Afrika nach Amerika wurden versklavte Menschen verschleppt.",
    stem: "Was wurde von Afrika nach Amerika gebracht?",
    options: [
      "Werkzeuge",
      "versklavte Menschen",
      "Tiere für den Zoo",
      "Gold",
    ],
    correctIndex: 1,
  },
  {
    id: "kol-drh-arbeit",
    topic: "Kolonialismus",
    explanation: "In Amerika mussten die versklavten Menschen auf Plantagen, Farmen und in Bergwerken arbeiten.",
    stem: "Wo mussten die versklavten Menschen in Amerika arbeiten?",
    options: [
      "auf Plantagen, Farmen und in Bergwerken",
      "in Schulen und Ämtern",
      "auf großen Schiffen als Kapitäne",
      "gar nicht",
    ],
    correctIndex: 0,
  },
  {
    id: "kol-drh-waren-europa",
    topic: "Kolonialismus",
    explanation: "Von Amerika nach Europa gingen begehrte Rohstoffe wie Zucker, Baumwolle und Edelmetalle.",
    stem: "Welche Waren gingen von Amerika nach Europa?",
    options: [
      "Glasperlen und Alkohol",
      "Rohstoffe wie Zucker, Baumwolle und Edelmetalle",
      "alte Schusswaffen",
      "nichts",
    ],
    correctIndex: 1,
  },
  {
    id: "kol-drh-zahl",
    topic: "Kolonialismus",
    explanation: "Vom 16. bis 19. Jahrhundert wurden nach Schätzungen mehr als 14 Millionen Menschen aus Afrika verschleppt.",
    stem: "Wie viele Menschen wurden schätzungsweise aus Afrika verschleppt?",
    options: [
      "etwa 1.000",
      "etwa 100.000",
      "mehr als 14 Millionen",
      "genau 500",
    ],
    correctIndex: 2,
  },
  {
    id: "kol-drh-schiff",
    topic: "Kolonialismus",
    explanation: "Auf den Sklavenschiffen wurden die Menschen dicht zusammengepfercht im Laderaum transportiert.",
    stem: "Wie wurden die Menschen auf den Sklavenschiffen transportiert?",
    options: [
      "in eigenen Kabinen",
      "an Deck in der Sonne",
      "dicht zusammengepfercht im Laderaum",
      "in kleinen Booten hinterher",
    ],
    correctIndex: 2,
  },
  {
    id: "kol-drh-verbot",
    topic: "Kolonialismus",
    explanation: "Erst im Laufe des 19. Jahrhunderts wurde der Sklavenhandel weltweit verboten.",
    stem: "Wann wurde der Sklavenhandel weltweit verboten?",
    options: [
      "im 19. Jahrhundert",
      "schon im 15. Jahrhundert",
      "im Jahr 1521",
      "gar nicht",
    ],
    correctIndex: 0,
  },
];
