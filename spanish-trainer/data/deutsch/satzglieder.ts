import type { McItem } from "@/lib/mc";

/** Deutsch — Satzglieder (Subjekt, Prädikat, Objekte, adverbiale Bestimmungen, Deutschbuch S. 306–307). */
export const satzglieder: McItem[] = [
  {
    id: "stg-subjekt-frage",
    topic: "Satzglieder",
    stem: "Mit welcher Frage findet man das Subjekt?",
    options: ["Wer oder was?", "Wen oder was?", "Wem?", "Wessen?"],
    correctIndex: 0,
  },
  {
    id: "stg-subjekt-finden",
    topic: "Satzglieder",
    stem: "Was ist in „Der Hund bellt laut.“ das Subjekt?",
    options: ["laut", "bellt", "Der Hund", "Hund bellt"],
    correctIndex: 2,
  },
  {
    id: "stg-praedikat",
    topic: "Satzglieder",
    stem: "Welches Satzglied wird vom Verb gebildet?",
    options: ["das Subjekt", "das Objekt", "die adverbiale Bestimmung", "das Prädikat"],
    correctIndex: 3,
  },
  {
    id: "stg-akkusativ-frage",
    topic: "Satzglieder",
    stem: "Mit welcher Frage findet man das Akkusativobjekt?",
    options: ["Wen oder was?", "Wem?", "Wer oder was?", "Wessen?"],
    correctIndex: 0,
  },
  {
    id: "stg-dativ-frage",
    topic: "Satzglieder",
    stem: "Mit welcher Frage findet man das Dativobjekt?",
    options: ["Wen oder was?", "Wem?", "Wessen?", "Wo?"],
    correctIndex: 1,
  },
  {
    id: "stg-akkusativobjekt",
    topic: "Satzglieder",
    stem: "Welches Satzglied ist „ein Buch“ in „Lena schenkt ihrem Bruder ein Buch.“?",
    options: ["Subjekt", "Dativobjekt", "Akkusativobjekt", "adverbiale Bestimmung"],
    correctIndex: 2,
  },
  {
    id: "stg-dativobjekt",
    topic: "Satzglieder",
    stem: "Welches Satzglied ist „ihrem Bruder“ in „Lena schenkt ihrem Bruder ein Buch.“?",
    options: ["Akkusativobjekt", "Subjekt", "Prädikat", "Dativobjekt"],
    correctIndex: 3,
  },
  {
    id: "stg-adv-zeit-frage",
    topic: "Satzglieder",
    stem: "Mit welcher Frage findet man die adverbiale Bestimmung der Zeit?",
    options: ["Wann?", "Wo?", "Wie?", "Warum?"],
    correctIndex: 0,
  },
  {
    id: "stg-adv-zeit-finden",
    topic: "Satzglieder",
    stem: "Welches Satzglied ist „Am Abend“ in „Am Abend lesen wir.“?",
    options: ["adverbiale Bestimmung der Zeit", "Subjekt", "Akkusativobjekt", "Prädikat"],
    correctIndex: 0,
  },
  {
    id: "stg-umstellprobe",
    topic: "Satzglieder",
    stem: "Womit prüft man, ob ein Satzteil ein Satzglied ist?",
    options: [
      "mit der Großschreibung",
      "mit der Umstellprobe (Verschieben im Satz)",
      "mit dem Wörterbuch",
      "mit der Silbentrennung",
    ],
    correctIndex: 1,
  },
  {
    id: "stg-adv-ort-frage",
    topic: "Satzglieder",
    stem: "Mit welcher Frage findet man die adverbiale Bestimmung des Ortes?",
    options: ["Wo?", "Wann?", "Wie?", "Warum?"],
    correctIndex: 0,
  },
  {
    id: "stg-praedikat-finden",
    topic: "Satzglieder",
    stem: "Was ist in „Am Morgen läuft Tom schnell.“ das Prädikat?",
    options: ["Tom", "läuft", "schnell", "Am Morgen"],
    correctIndex: 1,
  },
];
