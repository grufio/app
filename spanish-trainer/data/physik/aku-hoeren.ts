import type { McItem } from "@/lib/mc";

/** Akustik — Hören & Lärm (Physik Klasse 7, Realschule BW). */
export const akuHoeren: McItem[] = [
  {
    id: "aku-ohr",
    topic: "Akustik",
    stem: "Welcher Teil des Ohrs wird vom Schall in Schwingung versetzt?",
    options: ["das Trommelfell", "die Nase", "die Augenlinse", "die Netzhaut"],
    correctIndex: 0,
  },
  {
    id: "aku-trommelfell",
    topic: "Akustik",
    stem: "Was macht das Trommelfell, wenn Schall darauf trifft?",
    options: ["es beginnt zu schwingen", "es leuchtet", "es wird warm", "es wird magnetisch"],
    correctIndex: 0,
  },
  {
    id: "aku-hoerbereich",
    topic: "Akustik",
    stem: "Welchen Frequenzbereich hört ein gesunder junger Mensch etwa?",
    options: ["20 Hz bis 20000 Hz", "0 Hz bis 100 Hz", "1 Hz bis 100 Hz", "bis 300000 km/s"],
    correctIndex: 0,
  },
  {
    id: "aku-ultraschall",
    topic: "Akustik",
    stem: "Wie nennt man Töne oberhalb des menschlichen Hörbereichs (über 20000 Hz)?",
    options: ["Infraschall", "Ultraschall", "Überschall", "Lärm"],
    correctIndex: 1,
  },
  {
    id: "aku-infraschall",
    topic: "Akustik",
    stem: "Wie nennt man Töne unterhalb des Hörbereichs (unter 20 Hz)?",
    options: ["Ultraschall", "Infraschall", "Überschall", "Hall"],
    correctIndex: 1,
  },
  {
    id: "aku-fledermaus",
    topic: "Akustik",
    stem: "Womit orientieren sich Fledermäuse im Dunkeln?",
    options: ["mit Infrarotlicht", "mit Ultraschall", "mit Magnetismus", "mit Röntgenstrahlen"],
    correctIndex: 1,
  },
  {
    id: "aku-hund",
    topic: "Akustik",
    stem: "Warum hört ein Hund eine Hundepfeife, ein Mensch aber nicht?",
    options: [
      "der Ton liegt im Ultraschall, den nur der Hund hört",
      "der Ton ist zu leise",
      "der Ton ist zu tief",
      "der Hund sieht den Ton",
    ],
    correctIndex: 0,
  },
  {
    id: "aku-laermschutz",
    topic: "Akustik",
    stem: "Was schützt das Gehör vor Schäden?",
    options: [
      "möglichst laute Musik hören",
      "Gehörschutz oder Ohrstöpsel bei Lärm",
      "den Mund schließen",
      "eine Sonnenbrille tragen",
    ],
    correctIndex: 1,
  },
  {
    id: "aku-laerm-schaden",
    topic: "Akustik",
    stem: "Was kann dauerhaft sehr lauter Lärm verursachen?",
    options: ["besseres Hören", "bleibende Hörschäden", "Farbenblindheit", "gar nichts"],
    correctIndex: 1,
  },
];
