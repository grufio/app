# Spanisch-Trainer — Unidad 5

Ein schlanker, spielerischer Vokabeltrainer für Spanisch — gebaut für
fokussiertes Lernen (ein Wort pro Bildschirm, klare Multiple-Choice-Auswahl,
Aussprache zum Anhören, einblendbare Hinweise). Auch **Konjugationen** werden
mitgelernt.

Eigenständiges Projekt (unabhängig vom restlichen Repo), gedacht für ein
**Vercel**-Deployment mit Root-Verzeichnis `spanish-trainer`.

## Features

- **Ein Wort pro Seite**, große Schrift, mobil zuerst.
- **Multiple Choice**: 1 richtige + 4 falsche Antworten, plausible Distraktoren
  (bevorzugt gleiche Wortart).
- **Gemischte Richtung**: pro Karte zufällig Spanisch→Deutsch oder
  Deutsch→Spanisch.
- **Aussprache** per Klick (Web Speech API, `es-ES`).
- **Hinweis** progressiv & kontextabhängig: Wortart/Artikel → Beispielsatz
  (falls vorhanden) → erster Buchstabe + Länge.
- **Game-Feel**: Punkte, Combo-Multiplikator, 5 Leben (Herzen),
  Level-Checkpoints, Highscore (localStorage), Animationen, Sound, Confetti.
- **5 Fehler → Neustart** mit neu gemischter Reihenfolge.
- **Reizarm-Schalter**: Ton & Animationen abschaltbar; respektiert
  `prefers-reduced-motion`.

## Entwicklung

```bash
cd spanish-trainer
npm install
npm run dev      # http://localhost:3000
npm run test     # Vitest (Logik: choices, scoring, reducer, hints)
npm run build    # Production-Build
```

## Vokabeldaten

Die Vokabeln liegen in [`data/unidad5.ts`](data/unidad5.ts). Die aktuelle Liste
ist aus dem Buchfoto abgeleitet und mit `needsCheck: true` markiert — bitte
gegen das Buch prüfen/korrigieren. Neue Vokabel = ein Objekt mehr im Array
(`VocabItem`, siehe [`lib/types.ts`](lib/types.ts)). Konjugationen sind normale
Einträge mit `type: "conjugation"` und `infinitive` / `person` / `tense`.

## Deployment (Vercel)

1. Neues Vercel-Projekt aus diesem Repo anlegen.
2. **Root Directory** auf `spanish-trainer` setzen.
3. Framework-Preset: Next.js (Standard-Build, keine Env-Variablen nötig).

## Hinweis zur Aussprache

Die Aussprache nutzt die browsereigene Web Speech API. Verfügbarkeit und
Stimmenqualität hängen vom Gerät/Browser ab (insb. iOS Safari). Fehlt eine
spanische Stimme, wird der Lautsprecher-Button still ausgeblendet.
