# Handoff — Editor-Edit-Modell-Umbau + 429-Bug (Apply)

Stand: 2026-07-24. Übergabe an den nächsten Bearbeiter. Zwei Themen: (A) der laufende
Editor-Edit-Modell-Umbau (Etappen), (B) ein Prod-429-Bug beim Apply (Ursache belegt).

---

## 0. Kritische Constraints (lokale Memory-Regeln — unbedingt beachten)
- **Image/Artboard ist NIE „live".** Wiederkehrende Falschannahme. Image = **deferred (Draft + Apply)**.
  Der Code committet heute sofort (`image-sheet.tsx` `onCommit → canvasRef.setImageSize`, „Done" = nur
  `onClose`) — DAS ist der Bug, nicht das Modell. Das Wort „live" NICHT benutzen, Thema nicht aufmachen.
- **Keine Pflaster-Fixes.** Immer die Ursache lösen, dem etablierten Muster folgen (Geschwister-Komponente).
- **Controls disablen, NIE bedingt aus dem DOM entfernen** (Layout-Sprung).
- **Antworten kurz** (1–3 Sätze), keine Trade-off-Menüs — das objektiv Beste selbst bauen.
- **Latenz nur auf Cloud Run messen**, nie lokal. **GPU-Kaltstart NIE thematisieren.**
- Branch immer frisch ab `main` vor der ersten Änderung. Commit/PR nur auf ausdrückliches Wort.
  Nach `gh pr create` → `gh auth switch --user grufio`. Nur explizite Pfade stagen (kein `git add -A`).
  Commit-Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; PR-Body endet mit
  🤖 Generated with [Claude Code].

---

## A) Editor-Edit-Modell-Umbau

**Konzept + Plan:** `~/.claude/plans/editor-edit-model-concept.md` (vollständig, mit User-Entscheidungen).

**Warum:** Image/Filter/Trace hatten zufällig verschiedene Interaktionsmodelle → viele Bugs
(Done-vs-Apply, hängender Edit-Mode nach Delete, Delete an 5 Stellen, toter Code). Fünf belegte
Read-only-Maps liegen als Grundlage vor (Flächen, Delete-Fluss, Preview-Button, Section-Orchestrierung,
Image/Filter). Kernidee: 2 Kategorien — **Pick** (Filter) und **Draft+Apply** (Image, Trace; Trace mit
Preview). „Done" fällt weg → überall **Cancel/Apply** (+ Preview bei Trace).

**Entschieden (vom User):** (1) Delete nur in der Bar. (2) Image = deferred (nie live). (3) Delete
immer mit Confirm-Dialog. (4) „Colors" ist keine Section mehr — nur Dialog aus der Trace-Bar; den
„colors"-Step aus `EDITOR_SECTIONS` entfernen.

**Etappen:**
- **Etappe 1 — DONE, gemergt (PR #691):** Delete vereinheitlicht — nur in der Bar, immer Confirm-Dialog,
  Button `disabled` wenn `!workflow.canMutate` (kein Reject mehr → behebt „hängt nach Delete"). Delete
  aus `TraceDialogShell` + `GenericTraceController` + der ganzen `onDeleteTrace`-Kette entfernt. Neuer
  `deleteScope`-Confirm in `ProjectEditorShell.client.tsx` (~611), Muster wie `resetScope`. gate:ci grün.
- **Etappe 2 — OFFEN:** Image auf **Draft+Apply**. `image-sheet.tsx`: Felder in einen Draft statt
  sofort-committing `setImageSize`/`setImagePosition`; Header/Footer bekommen **Cancel + Apply**,
  „Done" raus. Beim Editieren zeigt der Canvas den Draft (Feedback), **Apply speichert, Cancel verwirft**,
  nichts persistiert vor Apply. (Persist-Pfad: `transform-controller.ts` — „setImageSize commits immediately".)
- **Etappe 3 — OFFEN:** Aktions-Grammatik überall angleichen (Cancel/Apply/Preview je Kategorie),
  „Done" nirgends mehr. `TraceDialogShell` ist geteilt (Pixelate/Circulate/Linerate) — die müssen
  weiter funktionieren.
- **Etappe 4 — OFFEN:** Aufräumen — `EDITOR_SECTIONS` „colors" raus; toter `TraceSheet` + `editOpen`
  löschen (`trace-surface-scope.tsx:55`, wird nie `true`); die zwei Trace-Picker-Kanäle
  (`pendingTraceKindOpen`/`pendingTraceSelectionOpen`) zu einem zusammenführen; „Reset" → „Remove
  filter/trace" umbenennen (ist ein Downstream-Delete, `delete-message.ts`).

**Prozess je Etappe:** frischer Branch ab main → architect umsetzen lassen (präzise Spec) → selbst
`gate:ci` + Diff-Review → PR auf User-Wort.

---

## B) 429-Bug: Apply schlägt mit 429 fehl (Prod, gruf.app)

**Symptom:** Ein einzelner Apply-Klick → Client-Konsole zeigt **429** auf `/api/projects/{id}/trace`
UND `/api/projects/{id}/trace/preview`. Apply schlägt fehl. Apply-Spinner überlappt zusätzlich das
„Apply"-Label (separater kleiner UI-Bug, noch offen).

**Untersuchung (auth: `gcloud auth login` + `vercel` CLI, Token in `~/.vercel/auth.json`):**
- **GPU-Dienst `gruf-linerate-gpu` (europe-west4):** in 8h nur **3 Requests, alle 200**. concurrency=1,
  maxScale=1, Revision `00002-9ks`. → GPU ist NICHT die Ursache.
- **App-Code gibt NIRGENDS 429 zurück:** `with-project-route-auth.ts` → 400/403, `requireUser` → 401,
  `jsonError`/`route-guards.ts` → kein 429. Kein App-Rate-Limiter auf den Trace-Routen, keine middleware.ts.
  (`createRateLimiter` nur in `app/api/errors/ingest/route.ts`.)
- **Vercel-Funktions-Logs (`vercel logs <prod-url> --json`):** JEDE Trace-Anfrage, die die Funktion
  erreichte, hat `responseStatusCode: 200` — Apply, Preview, Delete, filter-working-copy, master, alle 200.
- **Vercel Firewall (`vercel firewall overview`, Projekt grufio-web):** „Not configured", Attack Mode „Off",
  nur automatische **„System Mitigations: Active"**.
- **Schlussfolgerung (belegt):** Die 429er stehen NICHT in den Funktions-Logs → sie werden am
  **Vercel-Edge abgewiesen, BEVOR** die Funktion läuft (System Mitigations). Auslöser: die App feuert
  **pro Editor-Aktion einen Schwall von ~4–5 gleichzeitigen** API-Calls — z.B. bei Apply gleichzeitig
  `POST /trace` + `GET /trace` + `POST /images/filter-working-copy` + `GET /images/master` (Workflow-
  Refetches, in den Logs im selben ms sichtbar). „Ein Click" = ~5 parallele Requests → Edge-Mitigation
  stuft es als Burst ein → 429 auf einen Teil.

**Root-Fix (empfohlen, App-seitig, KEIN Pflaster):** Den **Refetch-Fan-out pro Aktion reduzieren/bündeln**
— nach einer Mutation nicht 4 Endpunkte parallel neu laden. Einstieg: `ProjectEditorShell.client.tsx`
(`useTraceHandlers` `refreshTrace` ~178, der Workflow-Adapter, die post-mutation-Refreshes von
trace/filter-working-copy/master). Ziel: 1–2 gezielte/sequentielle Refetches statt 5 parallele.
NICHT als Retry-on-429-Pflaster lösen (vom User ausdrücklich abgelehnt).

**Noch offen / nächster Schritt:** Den genauen Fan-out nach Apply/Delete kartieren (welche Hooks/Effekte
die parallelen Refetches auslösen) und einen konkreten Verschlankungsplan machen. `isTransientFilterServiceFailure`
(`_helpers.ts:167`) retryt 502/503/504 — 429 bewusst NICHT (kein Pflaster gewünscht).

---

## C) Repo-/PR-Stand
- Merged (main): #684 (compose-bbox), #685 (GPU-Snap), #686–#690 (Server-Preview @500k + Preview-Button-
  Fixes), #691 (Delete-Vereinheitlichung/Etappe 1).
- Aktueller Branch: `refactor/editor-delete-unify` (Etappe 1, bereits gemergt als #691).
- GPU-Dienst hat KEINE CI-Auto-Deploy — filter-service-Änderungen müssen manuell auf `gruf-linerate-gpu`
  nachgezogen werden (Dockerfile.gpu neu bauen + `gcloud run deploy`). Prod = Vercel-Projekt `grufio-web`
  (gruf.app), nicht `app`.
