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
    explanation: "Licht breitet sich geradlinig aus – immer in geraden Linien (Lichtstrahlen).",
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
    explanation: "Wir sehen einen Gegenstand, weil er Licht in unser Auge zurückwirft.",
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
    explanation: "Der Mond leuchtet nicht selbst – er reflektiert das Licht der Sonne.",
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
    explanation: "Die dunklen Flecken auf dem Mond sind große, flache Tiefebenen, die „Mare“ heißen.",
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
    explanation: "Reflexionsgesetz: Einfallswinkel = Ausfallswinkel (Reflexionswinkel).",
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
    explanation: "Beide Winkel misst man vom Lot aus – der Linie senkrecht zur Spiegelfläche.",
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
    id: "optka-lot-definition",
    topic: "Optik",
    explanation: "Das Lot ist die Senkrechte zur Spiegelfläche im Auftreffpunkt des Strahls.",
    stem: "Was ist das Lot in der Reflexionszeichnung (Lichtstrahl auf Spiegel)?",
    options: [
      "die Senkrechte zur Spiegelfläche im Auftreffpunkt",
      "der einfallende Lichtstrahl",
      "die Spiegelfläche selbst",
      "die Waagerechte am Boden",
    ],
    correctIndex: 0,
  },
  {
    id: "optka-einfallswinkel",
    topic: "Optik",
    explanation: "Der Winkel zwischen einfallendem Strahl und Lot heißt Einfallswinkel.",
    stem: "Wie heißt im Schaubild der Winkel zwischen einfallendem Lichtstrahl und dem Lot?",
    options: ["Ausfallswinkel", "Einfallswinkel", "Spiegelwinkel", "Brennwinkel"],
    correctIndex: 1,
  },
  {
    id: "optka-ausfallswinkel",
    topic: "Optik",
    explanation: "Der Winkel zwischen reflektiertem Strahl und Lot heißt Ausfallswinkel (Reflexionswinkel).",
    stem: "Wie heißt im Schaubild der Winkel zwischen reflektiertem Lichtstrahl und dem Lot?",
    options: [
      "Brechungswinkel",
      "Einfallswinkel",
      "Ausfallswinkel (Reflexionswinkel)",
      "Öffnungswinkel",
    ],
    correctIndex: 2,
  },
  {
    id: "optka-ausfallswinkel-wert",
    topic: "Optik",
    explanation: "Weil Einfallswinkel = Ausfallswinkel gilt, ist der Ausfallswinkel genauso groß wie der Einfallswinkel.",
    stem: "Ein Lichtstrahl trifft mit 35° zum Lot auf einen ebenen Spiegel. Wie groß ist der Ausfallswinkel?",
    options: ["17,5°", "35°", "55°", "70°"],
    correctIndex: 1,
  },
  {
    id: "optka-spiegelbild",
    topic: "Optik",
    explanation: "Im ebenen Spiegel ist das Bild gleich groß, aufrecht und seitenverkehrt (links und rechts vertauscht).",
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
    explanation: "Eine Lupe ist eine Sammellinse: Sie bündelt das Sonnenlicht in einem Brennpunkt, dort wird es sehr heiß.",
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
    explanation: "Der tote Winkel ist der Bereich, den der Fahrer weder direkt noch im Spiegel sehen kann.",
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
    explanation: "Den toten Winkel prüft man mit dem Schulterblick – vor dem Abbiegen kurz über die Schulter schauen.",
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
