import type { McItem } from "@/lib/mc";

/**
 * Optik — Klassenarbeit Physik II (Übungsaufgaben).
 *
 * Aus dem Arbeitsblatt „Übungsaufgaben Klassenarbeit Physik II" abgeleitete
 * Wiederholungsfragen zu den Optik-Themen: Lichtausbreitung & Sehen, Mond,
 * Reflexionsgesetz (Lot, Einfalls-/Ausfallswinkel), ebener Spiegel,
 * Lupe/Brennpunkt und toter Winkel.
 */
export const optKlassenarbeit: McItem[] = [
  {
    id: "optka-ausbreitung",
    topic: "Optik",
    stem: "Welche wichtige Eigenschaft hat die Ausbreitung des Lichts?",
    options: [
      "Licht breitet sich in Kurven aus",
      "Licht breitet sich geradlinig aus",
      "Licht breitet sich nur im Kreis aus",
      "Licht steht still",
    ],
    correctIndex: 1,
  },
  {
    id: "optka-sehen",
    topic: "Optik",
    stem: "Warum kannst du einen Gegenstand sehen, der selbst nicht leuchtet?",
    options: [
      "Dein Auge sendet Sehstrahlen aus",
      "Er erzeugt eigenes Licht",
      "Er wirft Licht in dein Auge zurück",
      "Man kann ihn gar nicht sehen",
    ],
    correctIndex: 2,
  },
  {
    id: "optka-mond-leuchtet",
    topic: "Optik",
    stem: "Warum können wir den Mond sehen, obwohl er nicht selbst leuchtet?",
    options: [
      "Er erzeugt eigenes Licht",
      "Er glüht von innen",
      "Die Erde beleuchtet ihn mit Lampen",
      "Er reflektiert das Licht der Sonne",
    ],
    correctIndex: 3,
  },
  {
    id: "optka-mond-flecken",
    topic: "Optik",
    stem: "Was sind die dunklen „Flecken“, die man auf dem Mond sieht?",
    options: [
      "große, dunkle Tiefebenen (Mare)",
      "Wolken aus Wasser",
      "der Schatten der Erde",
      "Löcher bis ins Innere des Mondes",
    ],
    correctIndex: 0,
  },
  {
    id: "optka-reflexionsgesetz",
    topic: "Optik",
    stem: "Wie lautet das Reflexionsgesetz?",
    options: [
      "Einfallswinkel + Reflexionswinkel = 90°",
      "Einfallswinkel = Reflexionswinkel (Ausfallswinkel)",
      "Der Einfallswinkel ist immer 0°",
      "Der Reflexionswinkel ist doppelt so groß",
    ],
    correctIndex: 1,
  },
  {
    id: "optka-lot",
    topic: "Optik",
    stem: "Von welcher Linie aus werden Einfalls- und Ausfallswinkel gemessen?",
    options: [
      "von der Spiegelfläche",
      "vom Lichtstrahl selbst",
      "vom Lot (senkrecht zur Spiegelfläche)",
      "vom Erdboden",
    ],
    correctIndex: 2,
  },
  {
    id: "optka-spiegelbild",
    topic: "Optik",
    stem: "Wie ist das Bild eines Gegenstands in einem ebenen Spiegel?",
    options: [
      "auf dem Kopf und kleiner",
      "vergrößert und farbig",
      "verschwommen und gedreht",
      "gleich groß, aufrecht und seitenverkehrt",
    ],
    correctIndex: 3,
  },
  {
    id: "optka-brennpunkt",
    topic: "Optik",
    stem: "Warum kann man mit einer Lupe in der Sonne ein Streichholz entzünden?",
    options: [
      "Die Sammellinse bündelt das Sonnenlicht in einem Brennpunkt",
      "Die Lupe erzeugt selbst Wärme",
      "Das Glas der Lupe verbrennt",
      "Die Lupe streut das Licht breit",
    ],
    correctIndex: 0,
  },
  {
    id: "optka-toter-winkel",
    topic: "Optik",
    stem: "Was ist der „tote Winkel“ beim Autofahren?",
    options: [
      "die dunkelste Stelle der Straße",
      "der Bereich, den der Fahrer weder direkt noch im Spiegel sehen kann",
      "der Winkel, in dem der Spiegel beschlägt",
      "die Stelle direkt vor dem Auto",
    ],
    correctIndex: 1,
  },
  {
    id: "optka-toter-winkel-tipp",
    topic: "Optik",
    stem: "Wie kannst du Unfälle durch den toten Winkel vermeiden?",
    options: [
      "nur in den Innenspiegel schauen",
      "schneller fahren",
      "vor dem Abbiegen über die Schulter schauen (Schulterblick)",
      "die Spiegel einklappen",
    ],
    correctIndex: 2,
  },
];
