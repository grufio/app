# App Review — Grufio (2026-05-05)

> ✅ **Status: closed (2026-05-06)** — all 26 findings (4 Blockers + 12 Smells +
> 10 Nits) addressed via the sys-update branch chain. This file is a dated
> historical snapshot; do not edit it after closure. Track open work in the
> latest dated review (currently `system-review-2026-05-06.md`) or in the
> sustainability plan at `~/.claude/plans/rosy-zooming-turing.md`.

Ganzheitliche Bestandsaufnahme. Drei parallele Reviews (Architektur/Code-Quality, Performance/Dependencies, Tests/Security/DX) zusammengefasst und priorisiert.

---

## BLOCKERS (zuerst angehen)

### B1. Auth-Flow ist untested
0 Tests für Login, OAuth-Callback, Token-Refresh. `lib/auth/redirect.test.ts` ist die einzige Auth-bezogene Datei. Login/Logout/Session-Edge-Cases (Tab-Race, Refresh-Failure) ungesichert.
**Aktion:** `e2e/auth-flow.spec.ts` (Login/OAuth/Logout/Session-Expiry) + Unit-Tests für `services/auth/client/*`.

### B2. `database.types.ts` nicht im CI-Gate
`verify:types-synced` läuft nur in `gate:pre-release`, nicht in `gate:ci`. Schema-Änderung ohne Type-Regen rutscht durch.
**Aktion:** `verify:types-synced` ins `gate:ci` aufnehmen (oder `types:gen` als Pre-Build-Step).

### B3. Master-Image-Upload ohne sichtbare Größenlimits
Bei großen Bildern (100MP+) Risiko OOM in Konva-Stage. `policy.ts` validiert dpi/bitDepth, aber Upload-Route hat keinen sichtbaren Byte-Cap.
**Aktion:** Explizites `maxUploadSize` (z.B. 50 MB) + Pixel-Cap in `master-image-upload.ts` validieren.

### B4. `project-canvas-stage.tsx` ist 908 Zeilen
Konva-Render + Image-Placement + Transform + Restore + Lifecycle in einer Datei. Schwer zu testen, hohes Regression-Risiko.
**Aktion:** Aufteilen in 3-4 Komponenten (Canvas-Wrapper, Image-Layer, Selection-Overlay, Controls-Sync).

---

## SMELLS (mittlere Priorität)

### S1. Code-Duplikation in Filter-Forms
`pixelate-form.tsx` (155 LOC), `lineart-form.tsx` (173 LOC), `numerate-form.tsx` (83 LOC) teilen identisches Schema (state → useMemo isValid → submit). Kein gemeinsamer `useFilterForm<T>` Hook.
**Aktion:** Generischer Filter-Form-Hook + Cancel/Apply-Footer extrahieren — schätzungsweise -100 LOC.

### S2. `force-dynamic` auf 17/20 API-Routes
Verhindert ISR/Caching pauschal. Master-Image-Listing und Filter-Listings könnten `revalidate: 60` oder `unstable_cache()` nutzen.
**Aktion:** Audit pro Route — nur dort `force-dynamic` wo wirklich nötig (z.B. Auth-abhängige). Listings-Routes per `revalidate`.

### S3. Keine Dynamic Imports für Editor
`konva` (~150KB) + `react-konva` + `sharp` laden initial. Editor-Bundle blast Dashboard-FCP.
**Aktion:** `app/projects/[projectId]/page.tsx` → Editor-Root via `next/dynamic({ ssr: false })`.

### S4. Visual-Tests zu schmal
3 Snapshots (Login, Artboard-Panel, Image-Panel). Filter-Dialog, Project-Create, Restore/Delete-Confirm fehlen.
**Aktion:** 4-5 weitere Snapshots in `e2e/forms.visual.spec.ts`.

### S5. Coverage-Threshold zu niedrig
22% Lines/Statements im Gate. Zwar ehrlich, aber kein Anreiz zu wachsen. Critical-Path-Code (`filter-variants.ts`, `master-image-upload.ts`) untested.
**Aktion:** schrittweise auf 40-50% Lines anheben, parallel Tests für die kritischen Services schreiben.

### S6. Service-Role-Konvention nicht durchgesetzt
`verify-rls.mjs` Allowlistet `service-role.ts`, aber `filter-variants.ts` delegiert mit Service-Role. Konvention "nur Storage-Cleanup nach Soft-Delete" steht nur im JSDoc, kein Lint/Verify-Check.
**Aktion:** ESLint-Regel oder Verify-Script erweitern um `createSupabaseServiceRoleClient()`-Calls außerhalb erlaubter Pfade zu fangen.

### S7. npm audit Vulnerabilities
8 high + 4 moderate aus `npm audit`.
**Aktion:** `npm audit fix` mit Review pro Bump. Sharp/Playwright/Next-LTS prüfen.

### S8. `image-panel.tsx` ist 451 Zeilen
Position + Size + Rotation + Metadata + DPI in einer Komponente.
**Aktion:** Splitten in `ImageTransformFields` + `ImageMetadataPanel`.

### S9. `force-dynamic` + Signed-URL-TTL inkonsistent
Dashboard 10min, Filter-Working-Copy 1h. Cache-Invalidierung kompliziert wenn URLs gecached werden.
**Aktion:** Pro Use-Case konsolidieren (Thumbnails 10min, langlebige Filter-Copies 1h ist OK — dokumentieren).

### S10. Filter-Service Unit-Test-Lücken
`pixelate.ts`, `lineart.ts`, `numerate.ts` nutzen Python-Service per fetch — hard zu unit-testen, aber Validation-Layer + Storage-Pfade sind testbar und sind es nicht.
**Aktion:** Pure Validation-Funktionen aus `pixelate.ts` extrahieren und unit-testen (toInt, pickOutputFormat, contentTypeFor).

### S11. Naming-Mix bei File-Namen
PascalCase (`ProjectEditorRightPanel.tsx`, `LineArtFilterController.tsx`) neben kebab-case (`pixelate-form.tsx`, `right-panel-controls.tsx`). Vermutlich historisch.
**Aktion:** Konvention festlegen (kebab-case ist der Trend in shadcn/Next), schrittweise migrieren — oder dokumentieren falls absichtlich (Container = PascalCase, Sub = kebab).

### S12. Error-Reporting nur `console.error`
`lib/monitoring/error-reporting.ts` loggt nur lokal. Prod-Bugs sind blind.
**Aktion:** Optional Sentry oder `NEXT_PUBLIC_ERROR_INGEST_URL` (existiert) wirklich nutzen — strukturierte Logs mit `{stage, projectId, userId}`.

---

## NITS (niedrige Priorität)

### N1. JSDoc-Coverage uneinheitlich
Manche Komponenten gut dokumentiert (`project-canvas-stage.tsx`, `editor-error-boundary.tsx`), andere null (`numerate-form.tsx`).
**Aktion:** Optional ESLint-Rule `require-jsdoc` für `app/`, `features/`, `services/` Top-Level-Exports.

### N2. HTTP-Cache-TTL kurz (2s)
`lib/api/http.ts:19`. Bei mehreren Hooks fetcht jeder die gleiche Resource separat.
**Aktion:** TTL auf 5-10s anheben, mit `invalidateFetchJsonGetCache()` bei Mutations.

### N3. Grid-Provider Context-Value nicht memoized
`lib/editor/project-grid.tsx` value-Object wird bei jedem Render neu erzeugt → Consumer re-rendern unnötig.
**Aktion:** `useMemo()` um den Context-Value.

### N4. XState nur für Editor-Workflow, nicht für Konva-State
Selection/Transform/Viewport sind mit Refs+useState gelöst. Inkonsistent zur Workflow-Architektur.
**Aktion:** Optional langfristig — XState auf Konva-State ausweiten falls die State-Komplexität wächst.

### N5. 40+ npm scripts
`test:e2e:*` Varianten (smoke/workflow/local/ci/pr/nightly/full/visual) sind verwirrend.
**Aktion:** README-Sektion mit gruppierten Scripts (TEST/E2E/VERIFY/DB/DEPLOY).

### N6. `e2e/_mocks.ts` undokumentiert
`setupMockRoutes()` und Header-Convention `x-e2e-user` nirgends erklärt.
**Aktion:** JSDoc-Header + Beispiel.

### N7. Env-Vars-Validation fehlt
`lib/supabase/server.ts` und `browser.ts` lesen Vars ohne Schema-Check.
**Aktion:** zod-Schema oder einfacher Throw bei missing required vars beim App-Start.

### N8. Inconsistente Funktions-Stile
`export function X` (häufig) vs `const X = () =>` (selten).
**Aktion:** ESLint-Rule `prefer-function-declaration` falls Konsistenz wichtig.

### N9. Playwright-Flaky-Metrics ohne Auswertung
`check-playwright-flaky.mjs` schreibt JSON, aber kein Dashboard / Schwellwert.
**Aktion:** Flaky-Rate >5% → CI-Annotation oder Slack-Notify.

### N10. Doc-Lücke: Onboarding für neue Devs
`README.md` minimal. Kein "wie starte ich lokal" / "wie deploy ich".
**Aktion:** README mit Quickstart, Branching-Convention, Gate-Übersicht.

---

## Was gut ist (Anerkennung)

- Layering ist sauber: `app/` → `features/` → `components/ui/` → `lib/` → `services/`, keine Rückimporte
- Default vs App Forms saubere Trennung (gerade gefixt)
- Error-Boundaries vorhanden und dokumentiert
- 282 Unit-Tests + Visual-Regression-Tests + E2E-Smoke
- TypeScript-Gate aktiv (0 Errors)
- RLS überall aktiv, durch `verify-rls.mjs` lokal abgesichert
- Auto-Deploy via GitHub Actions + WIF (kein langlebiger Secret)
- Filter-Service auf Cloud Run, scale-to-zero
- Form-Komponenten haben Visual-Snapshots (3) als Drift-Schutz

---

## Top-3 Empfehlungen für nächsten Schritt

1. **B1+B2 zuerst**: Auth-Tests + Types-Sync ins CI-Gate. Die zwei größten Risiken (Auth-Regression, Schema-Drift) ohne Schutznetz.
2. **B4 + S1 + S8 als Refactor-Sprint**: 3 Files (`project-canvas-stage`, `image-panel`, Filter-Forms) zusammen splitten — entlastet ~1000 LOC.
3. **S2 + S3**: `force-dynamic` Audit + Editor-Dynamic-Import — spürbare Performance-Gewinne ohne Verhaltens-Änderung.

Aufwand für die 3 Empfehlungen: ~6-8h.
