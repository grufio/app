import type { McItem } from "@/lib/mc";

/** Größen & Messen — Messen & Auswerten (Physik Klasse 7, Realschule BW). */
export const grsMessen: McItem[] = [
  {
    id: "grs-laenge-messen",
    topic: "Größen",
    stem: "Womit misst man eine Länge?",
    options: ["mit der Stoppuhr", "mit dem Lineal oder Maßband", "mit der Waage", "mit dem Thermometer"],
    correctIndex: 1,
  },
  {
    id: "grs-zeit-messen",
    topic: "Größen",
    stem: "Womit misst man eine Zeitdauer?",
    options: ["mit der Stoppuhr", "mit dem Lineal", "mit der Waage", "mit dem Messbecher"],
    correctIndex: 0,
  },
  {
    id: "grs-masse-messen",
    topic: "Größen",
    stem: "Womit misst man die Masse eines Körpers?",
    options: ["mit dem Lineal", "mit der Waage", "mit der Stoppuhr", "mit dem Thermometer"],
    correctIndex: 1,
  },
  {
    id: "grs-temperatur",
    topic: "Größen",
    stem: "Womit misst man die Temperatur und in welcher Einheit?",
    options: [
      "mit dem Thermometer in Grad Celsius (°C)",
      "mit der Waage in Kilogramm",
      "mit dem Lineal in Meter",
      "mit der Stoppuhr in Sekunden",
    ],
    correctIndex: 0,
  },
  {
    id: "grs-ablesen",
    topic: "Größen",
    stem: "Wie liest man eine Messskala richtig ab?",
    options: [
      "senkrecht von vorne auf die Skala schauen",
      "von schräg unten schauen",
      "mit einem Auge aus großer Entfernung",
      "die Skala schräg halten",
    ],
    correctIndex: 0,
  },
  {
    id: "grs-genau-messen",
    topic: "Größen",
    stem: "Was gehört zu sorgfältigem Messen?",
    options: [
      "schätzen reicht immer",
      "genau ablesen und mehrmals messen",
      "das Gerät schräg halten",
      "möglichst schnell raten",
    ],
    correctIndex: 1,
  },
  {
    id: "grs-messfehler",
    topic: "Größen",
    stem: "Wie kann man einen Messfehler verkleinern?",
    options: [
      "mehrmals messen und den Mittelwert bilden",
      "nur einmal schnell messen",
      "das Ergebnis raten",
      "das Gerät schräg halten",
    ],
    correctIndex: 0,
  },
  {
    id: "grs-diagramm",
    topic: "Größen",
    stem: "Was kann man aus einem Messwerte-Diagramm ablesen?",
    options: [
      "die Farbe des Stoffs",
      "wie sich eine Größe verändert",
      "den Preis des Geräts",
      "das Gewicht des Papiers",
    ],
    correctIndex: 1,
  },
  {
    id: "grs-tabelle",
    topic: "Größen",
    stem: "Wozu trägt man Messwerte in eine Tabelle ein?",
    options: [
      "um Strom zu sparen",
      "um sie geordnet festzuhalten",
      "um sie zu verstecken",
      "um sie zu erwärmen",
    ],
    correctIndex: 1,
  },
  {
    id: "grs-experiment",
    topic: "Größen",
    stem: "Wie geht man bei einem Experiment sinnvoll vor?",
    options: [
      "sofort die Lösung raten",
      "nur zuschauen",
      "Vermutung aufstellen, messen und das Ergebnis prüfen",
      "gar nichts aufschreiben",
    ],
    correctIndex: 2,
  },
];
