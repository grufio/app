import type { McItem } from "@/lib/mc";

/** Deutsch — Tempus / Zeitformen (Das Verb und seine Tempora, Deutschbuch S. 297–298). */
export const tempus: McItem[] = [
  {
    id: "tmp-praesens",
    topic: "Tempus",
    stem: "Welche Zeitform drückt die Gegenwart aus?",
    options: ["Präsens", "Perfekt", "Präteritum", "Futur I"],
    correctIndex: 0,
  },
  {
    id: "tmp-praeteritum",
    topic: "Tempus",
    stem: "In welcher Zeitform steht „Ich spielte im Garten.“?",
    options: ["Perfekt", "Präteritum", "Plusquamperfekt", "Präsens"],
    correctIndex: 1,
  },
  {
    id: "tmp-perfekt",
    topic: "Tempus",
    stem: "In welcher Zeitform steht „Ich habe gespielt.“?",
    options: ["Präteritum", "Futur II", "Perfekt", "Plusquamperfekt"],
    correctIndex: 2,
  },
  {
    id: "tmp-plusquamperfekt",
    topic: "Tempus",
    stem: "In welcher Zeitform steht „Ich hatte gespielt.“?",
    options: ["Perfekt", "Präteritum", "Futur I", "Plusquamperfekt"],
    correctIndex: 3,
  },
  {
    id: "tmp-futur1",
    topic: "Tempus",
    stem: "In welcher Zeitform steht „Ich werde spielen.“?",
    options: ["Futur I", "Futur II", "Präsens", "Perfekt"],
    correctIndex: 0,
  },
  {
    id: "tmp-perfekt-bildung",
    topic: "Tempus",
    stem: "Womit bildet man das Perfekt?",
    options: [
      "mit „werden“ + Infinitiv",
      "mit „haben“ oder „sein“ + Partizip II",
      "nur mit der Grundform des Verbs",
      "mit „hatte“ + Partizip II",
    ],
    correctIndex: 1,
  },
  {
    id: "tmp-partizip2-gehen",
    topic: "Tempus",
    stem: "Wie lautet das Partizip II von „gehen“?",
    options: ["geht", "gegangen", "ging", "gegeht"],
    correctIndex: 1,
  },
  {
    id: "tmp-erzaehltempus",
    topic: "Tempus",
    stem: "Welche Zeitform ist beim schriftlichen Erzählen die übliche Erzählzeit?",
    options: ["Präsens", "Perfekt", "Präteritum", "Futur I"],
    correctIndex: 2,
  },
  {
    id: "tmp-vorzeitigkeit",
    topic: "Tempus",
    stem: "„Nachdem er gegessen hatte, ging er.“ In welcher Zeitform steht „gegessen hatte“?",
    options: ["Perfekt", "Präteritum", "Futur II", "Plusquamperfekt"],
    correctIndex: 3,
  },
  {
    id: "tmp-futur2",
    topic: "Tempus",
    stem: "In welcher Zeitform steht „Wir werden gewonnen haben.“?",
    options: ["Futur II", "Futur I", "Perfekt", "Plusquamperfekt"],
    correctIndex: 0,
  },
  {
    id: "tmp-hilfsverb-sein",
    topic: "Tempus",
    stem: "Welches Hilfsverb passt? „Ich ___ nach Hause gelaufen.“",
    options: ["habe", "bin", "werde", "war"],
    correctIndex: 1,
  },
];
