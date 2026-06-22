import type { McItem } from "@/lib/mc";

/** Optik — Brechung & Linsen (Physik Klasse 7, Realschule BW). */
export const optLinsen: McItem[] = [
  {
    id: "opt-brechung",
    topic: "Optik",
    explanation:
      "Tritt Licht schräg von Luft ins Wasser, ändert es seine Richtung – es wird zum Lot hin gebrochen.",
    stem: "Was passiert mit einem Lichtstrahl, der schräg von Luft ins Wasser tritt?",
    options: [
      "Er wird vom Lot weg gebrochen",
      "Er geht unverändert geradeaus",
      "Er wird zum Lot hin gebrochen",
      "Er wird vollständig verschluckt",
    ],
    correctIndex: 2,
  },
  {
    id: "opt-brechung-uebergang",
    topic: "Optik",
    explanation:
      "Trifft Licht senkrecht auf die Grenzfläche, wird es nicht gebrochen und läuft gerade weiter.",
    stem: "Wann wird ein Lichtstrahl an einer Grenzfläche gar nicht gebrochen?",
    options: [
      "wenn er ganz flach auftrifft",
      "wenn er senkrecht auf die Grenzfläche trifft",
      "immer",
      "nie",
    ],
    correctIndex: 1,
  },
  {
    id: "opt-strohhalm",
    topic: "Optik",
    explanation:
      "An der Wasseroberfläche wird das Licht gebrochen – deshalb wirkt der Strohhalm wie geknickt.",
    stem: "Warum erscheint ein Strohhalm im Wasserglas geknickt?",
    options: [
      "Wegen der Spiegelung am Glas",
      "Wegen der Lichtbrechung an der Wasseroberfläche",
      "Weil das Glas ihn verbiegt",
      "Weil Wasser den Strohhalm auflöst",
    ],
    correctIndex: 1,
  },
  {
    id: "opt-wasser-tiefer",
    topic: "Optik",
    explanation:
      "Durch die Lichtbrechung an der Wasseroberfläche erscheint Wasser flacher, als es wirklich ist.",
    stem: "Warum erscheint ein Schwimmbecken flacher, als es wirklich ist?",
    options: [
      "wegen der Spiegelung",
      "wegen der Lichtbrechung an der Wasseroberfläche",
      "weil Wasser das Licht verschluckt",
      "weil sich das Auge täuscht",
    ],
    correctIndex: 1,
  },
  {
    id: "opt-sammellinse",
    topic: "Optik",
    explanation: "Eine Sammellinse bündelt paralleles Licht in einem einzigen Punkt.",
    stem: "Was macht eine Sammellinse mit parallel einfallendem Licht?",
    options: [
      "Sie zerstreut es",
      "Sie verschluckt es",
      "Sie bündelt es in einem Brennpunkt",
      "Sie reflektiert es vollständig",
    ],
    correctIndex: 2,
  },
  {
    id: "opt-brennpunkt",
    topic: "Optik",
    explanation: "Den Punkt, in dem eine Sammellinse das Licht bündelt, nennt man Brennpunkt.",
    stem: "Wie heißt der Punkt, in dem eine Sammellinse paralleles Licht bündelt?",
    options: ["Mittelpunkt", "Brennpunkt", "Scheitelpunkt", "Lichtpunkt"],
    correctIndex: 1,
  },
  {
    id: "opt-zerstreuungslinse",
    topic: "Optik",
    explanation: "Eine Zerstreuungslinse spreizt parallele Lichtstrahlen auseinander.",
    stem: "Was macht eine Zerstreuungslinse mit parallelem Licht?",
    options: [
      "sie bündelt es in einem Punkt",
      "sie spreizt die Strahlen auseinander",
      "sie reflektiert es",
      "sie verschluckt es",
    ],
    correctIndex: 1,
  },
  {
    id: "opt-lupe",
    topic: "Optik",
    explanation: "Eine Sammellinse als Lupe lässt kleine Dinge vergrößert erscheinen.",
    stem: "Wofür wird eine Sammellinse als Lupe genutzt?",
    options: [
      "Um kleine Dinge vergrößert zu sehen",
      "Um Licht abzudunkeln",
      "Um Farben zu mischen",
      "Um Schatten zu erzeugen",
    ],
    correctIndex: 0,
  },
  {
    id: "opt-auge-linse",
    topic: "Optik",
    explanation: "Im Auge bündelt die Augenlinse das Licht scharf auf die Netzhaut.",
    stem: "Welches Bauteil im Auge bündelt das Licht auf die Netzhaut?",
    options: ["die Pupille allein", "die Augenlinse", "die Nasenwurzel", "das Trommelfell"],
    correctIndex: 1,
  },
  {
    id: "opt-brille",
    topic: "Optik",
    explanation:
      "Eine Brille mit Sammellinsen hilft weitsichtigen Menschen, wieder scharf zu sehen.",
    stem: "Wozu dient eine Brille mit Sammellinsen?",
    options: [
      "um die Augen abzudunkeln",
      "um Weitsichtigkeit auszugleichen",
      "um Farben zu mischen",
      "um Schatten zu erzeugen",
    ],
    correctIndex: 1,
  },
];
