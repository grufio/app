# System Review — Stabilität, UX, DB (2026-05-06)

> ✅ **Status: closed (2026-05-07)** — all 13 sprint items merged across the
> branch chain on main. The follow-on sustainability review is tracked in
> the plan at `~/.claude/plans/rosy-zooming-turing.md`. This file is a
> dated historical snapshot; do not edit it after closure.

## Context

Stand zwei Wochen nach dem ersten ganzheitlichen App-Review
(`docs/archive/app-review.md`, 2026-05-05): alle 26 Findings (4 Blockers + 12
Smells + 10 Nits) addressiert, plus Filter-Chain-Bugs gefixt (atomic
`remove_project_image_filter` RPC, `is_hidden` Persistierung,
chain_invalid UX-Toast), Visual-Baselines auf 9/9 aktiv, CI-Pipeline
auf Node 24 + offline schema-drift gate.

Methodik: 3 parallele Bestandsaufnahme-Subagents zu Stabilität, UX,
DB-Backend. Quellen: `npm run test:coverage`, `git log` der letzten 2
Wochen, `db/schema.sql`, ESLint/TypeScript Status auf main, CI-Run-
Historie.

---

## 1. Stabilität — Note: B+

### Test-Coverage

- **Aktuell:** 24.7% lines / 72.36% branches / 73.34% functions.
  Threshold sitzt bündig drauf.
- **Verteilung:** services/ 48% Test-Files, lib/ 39%, app/api/ 28%,
  features/ 20%.
- **Blindstellen** (kritische Pfade ohne Tests):
  1. `services/editor/server/filter-variants.ts` (490 LOC) — gerade
     gefixte RPC-Logik, **0 Tests**
  2. `services/editor/server/master-image-upload.ts` — Crop/Resize-
     Pfade teilweise skipped
  3. `services/editor/server/filters/{pixelate,lineart,numerate}.ts`
     — nur die `_helpers.ts` Pure-Validation getestet, der HTTP-Bridge
     nicht
  4. `app/api/projects/[projectId]/filters/*/route.ts` — Happy-Path
     getestet, Image-Upload-Failure-Pfad blind
  5. `app/api/projects/[projectId]/images/master/upload/route.ts` —
     Multipart-Edge-Cases nicht abgedeckt

### Error-Handling

- 10× `console.error` (akzeptabel niedrig), 19× `reportError` —
  gemischt.
- ~40% der Catch-Blöcke sind „silent" (re-throw oder
  `.catch(() => null)` ohne Reporting).
- API-Routes: `jsonError(msg, status, { stage, code })` durchgängig
  konsistent.
- Client-Layer (`lib/editor/use-*.ts`) inkonsistent: manche
  silent-fail, manche toast.

### Race-Conditions

- ✅ Filter-Apply: atomic via `append_project_image_filter` RPC mit
  advisory lock.
- ✅ Filter-Remove: atomic via neuer `remove_project_image_filter`
  RPC.
- ⚠️ **Concurrent Image-Upload + Filter-Apply** — kein gemeinsames
  Lock.
- ⚠️ **Multi-Tab edit** — keine pessimistic locks; Tip-Mismatch fängt
  Filter-Pfad, nicht andere Mutationen.
- ⚠️ **Crop + Filter parallel** — separate RPCs, kein kombiniertes
  Lock. Untested.

### Build + Dependencies

- ✅ TypeScript strict, `npm run typecheck` grün.
- ✅ **`@ts-expect-error`/`@ts-ignore`**: Nachzählung am 2026-05-07
  ergab **0 Suppressions im Source-Tree** (`app/`, `lib/`, `services/`,
  `features/`, `components/`, `scripts/`). Die 243 in der ersten
  Inventur waren `node_modules`-Anteile, die nicht sauber gefiltert
  waren. Nichts zu tun.
- ✅ ESLint: 0 warnings, 0 errors.
- ⚠️ **3 Major-Dep-Updates pending**: `@supabase/ssr` (0.8 → 0.10,
  SSR-Cookie-Handling), `@types/node` (20 → 25), `@supabase/supabase-js`
  (2.90 → 2.105). Auch `konva` minor + `@playwright/test` 1.57 → 1.59.

### CI/CD

- ✅ Pre-release-Gate solide (remote RLS, migrations, visual
  snapshots, types-sync).
- ✅ PR-Gate: lint + typecheck + units + RLS + service-role +
  types-with-migrations + coverage + E2E smoke.
- ⚠️ **Kein Rollback-Pfad** bei Prod-Fehler nach Deploy.
- ⚠️ **Flaky-Metriken** werden gesammelt aber nicht als Gate genutzt
  (nur Annotation).

---

## 2. UX — Note: B-

### Loading-States

- ✅ Filter-Apply: "Applying..." / "Processing..." Label-Swap.
- ✅ Restore/Delete: "Restoring…" / "Deleting…" Swap, Buttons disabled.
- ❌ **Editor-Boot:** Blank-Screen während Konva-Stage lädt
  (next/dynamic ssr:false). Kein Skeleton.
- ❌ **Sidebar-Operationen** (Add Filter, Workspace-Loading,
  Grid-Loading): Button disabled, aber kein Spinner — fühlt sich
  "frozen" an.
- ❌ **Image-Upload:** kein Progress-Bar, nur disabled Drop-Area.

### Error-Messages

- ⚠️ **Tech-Leak in Toasts:** `formatApiError` baut Strings wie
  `"Failed to apply filter (HTTP 409, stage=chain_invalid)"`. Wird
  direkt ins Toast gepumpt. Nur `BaseFilterController` hat dafür einen
  friendly handler — **andere Pfade leaken**.
- Inline-Errors in Modals: plain `<div className="text-destructive">`,
  kein Icon, kein Retry.
- Keine zentrale Error-Normalisierung. Jeder Caller macht es selbst.

### Keyboard + Accessibility

- ✅ ARIA: Toolbar, Canvas, Layers (tree role) korrekt benannt.
- ✅ Layers-Navigation per Arrow/Enter/Space.
- ❌ **Delete-Key, Escape, Cmd+Z** nicht implementiert.
- ⚠️ **Focus-Restore** in Modalen unvollständig — Radix-Defaults, kein
  expliziter Trap, Focus geht nach Close nicht zurück zum Trigger.
- ⚠️ Validation-Feedback in Forms ohne `aria-describedby`.

### Navigation

- ✅ Standard Next.js `<Link>`, prefetch.
- ⚠️ **Keine Guards** vor Mid-Mutation Browser-Back. User kann
  Filter-Apply abbrechen ohne Warnung — Working-Copy wird nicht
  cleaned.
- ⚠️ Scroll-Restoration: Browser-Defaults, nicht explizit gemanaged.

### Responsive — **High Pain**

- ❌ **Editor ist Desktop-only.** Keine `md:`/`lg:`/`xl:`-Klassen in
  den Editor-Components. Sidebar + Stage Side-by-Side fest.
- ❌ Keine pinch-zoom / two-finger-pan im Konva-Stage.
- ❌ **<1024px:** unbenutzbar, Right-Panel überlappt Stage.

### UI-Konsistenz

- ⚠️ **Modal-Drift:** Restore/Delete-Modals nutzen `Button` (h-9)
  statt `AppButton` (h-6). Optisch ein Sprung beim Modal-Open im
  Editor.
- 6+ Button-Varianten (default/destructive/outline/secondary/ghost/
  link). Secondary/Ghost teils redundant.

---

## 3. DB + Backend — Note: A-

### Schema (sehr gut)

- 11 Tabellen, alle mit `created_at`/`updated_at` + Trigger.
- ✅ Soft-Delete-Pattern (`deleted_at IS NULL`) konsistent über 38
  Query-Stellen.
- ✅ FK-Strategie konsistent CASCADE (außer
  `project_image_filters.input/output_image_id` mit RESTRICT —
  bewusst).
- ✅ Keine zirkulären FKs. `project_images.source_image_id` self-FK
  mit Constraint-Guards (master darf keinen source haben).
- ✅ `kind`-Enum-Migration (Phase 4a-4d) sauber durchgezogen — `role`
  column gerade dropped (`20260505180000`).

### RLS

- ✅ 10/11 Tabellen mit RLS aktiviert (nur `schema_migrations` ohne —
  Audit-Tabelle, korrekt).
- ✅ Policies vereinheitlicht via
  `20260505150000_unify_rls_owner_policies` — owner-only via
  `project_id ∈ user's projects`.
- ✅ `verify-rls.mjs` prüft RLS-Enable + auth.uid()-Presence +
  Storage-Policies + Service-Role-Allowlist.
- ✅ Service-Role-Bypass nur in
  `services/editor/server/filter-variants.ts`
  (storage-cleanup-after-soft-delete) — als 1 von 1 allowed Stelle
  definiert (`scripts/verify-service-role-usage.mjs`).

### Indexe

- ✅ 12 Schlüssel-Indexe, alle hot-paths abgedeckt:
  - `project_images_master_list_active_kind_idx` — die Listings-Query
  - `project_image_filters_project_order_idx` — Stack-Lookup
  - `project_image_state_project_role_image_idx` — Editor-State
- ✅ Redundanter Index gerade dropped (`role_idx` aus PK-Prefix-
  Coverage).
- Kein N+1-Pattern beobachtet.

### Migrations

- ✅ 14 aktive Migrations + 57 archived. Convention
  `<YYYYMMDDHHMM>_<descriptor>.sql` durchgehalten.
- ✅ Idempotent (`IF NOT EXISTS`, `DROP IF EXISTS`).
- ✅ Recent filter-fix RPC: 2-Phase renumber unter advisory lock.
- ⚠️ **Cleanup-Migrations** (`20260504120000`, `20260505100000`)
  beweisen: Daten-Drift HAT in Prod existiert. Filter-Apply ist jetzt
  geschützt, aber historische Drift wurde manuell aufgeräumt.

### Filter-Service (Python/FastAPI)

- ✅ 3 Endpoints (pixelate/lineart/numerate) implementiert.
- ✅ Cloud Run scale-to-zero deployed via WIF.
- ⚠️ **Cold-Start ~2-5s** für ersten Filter-Apply nach Idle. Kein
  Warm-Pool.
- ❌ **Keine Auth zwischen Next.js → Filter-Service.** Lokal trusted,
  Cloud Run via Private-Networking — aber kein API-Key-Check oder
  JWT-Forward. Falls Filter-Service URL leakt, kann jeder POST.
- ⚠️ Kein Fallback wenn Python-Service down — User sieht generischen
  500.

### Storage

- ✅ Signed-URL TTLs zentralisiert in `lib/storage/signed-url-ttl.ts`
  (10 min thumbnail, 1h filterWorkingCopy).
- ✅ Storage-Cleanup nach Soft-Delete via Service-Role-Client.
- ⚠️ **filter_working_copy Lifecycle:** Cleanup eventual-consistent —
  soft-delete passiert, physische Storage-Removal über cleanup-RPCs
  zeitversetzt.

---

## Gesamteinschätzung

**Note: B+** (über alle drei Achsen gewichtet).

### Was gut ist

- **DB ist die Vorzeigedisziplin** — saubere Schema-Evolution,
  durchgängige RLS, indexierte Hot-Paths, atomare RPCs für komplexe
  Operationen.
- **CI-Gate ist robust** — types-with-migrations, RLS-Verify,
  Service-Role-Allowlist, Visual-Snapshots. Wenig "rutscht durch".
- **Architektur klar geschichtet** — `app/` → `features/` →
  `components/` → `lib/`/`services/`, keine Rückimporte.
- **Recent Fixes haben gehalten** — Filter-Chain ist jetzt
  konsistent, Auth-Tests schützen Login, Coverage stabilisiert.

### Wo es brennt

1. **HIGH — Mobile/Tablet UX:** Editor unbenutzbar <1024px. Wenn das
   in der Roadmap steht, ist es viel Arbeit.
2. **HIGH — Filter-Service hat keine Auth:** Cloud Run private
   networking ist die einzige Verteidigungslinie. Wenn URL leakt → DoS-
   Vektor.
3. **MEDIUM — Concurrency-Gaps:** Filter-Operationen sind atomar,
   aber Image-Upload+Filter, Crop+Filter parallel sind ungetestet.
4. **MEDIUM — Test-Blindstellen:** `filter-variants.ts` (gerade
   gefixt) hat 0 Tests. Die nächste Regression dort wird teuer.
5. **MEDIUM — Error-UX:** Tech-leak in Toasts, kein zentraler
   Error-Normalizer. User sehen `stage=chain_invalid`-Strings.
6. **LOW — Stale Major Deps:** `@supabase/ssr` 0.8→0.10,
   `@types/node` 20→25. Aufschiebbar, aber nicht ewig.
7. **LOW — Loading-State-Drift:** Sidebar-Ops fühlen sich frozen an.

### Top-3 Empfehlungen für nächsten Sprint

1. **Filter-Service Auth absichern** + Tests für `filter-variants.ts`
   (~3-4h kombiniert). Schließt zwei MEDIUMs auf einmal. Branch:
   `chore/filter-service-auth-and-tests`.
2. **Zentraler Error-Normalizer** (`lib/api/error-normalizer.ts`) der
   `stage=chain_invalid`-Pattern aus Strings extrahiert + friendly
   Messages mappt. UI-Layer ruft den auf bevor toast/alert (~1-2h).
   Branch: `chore/error-normalizer`.
3. **Loading-Skeletons + Image-Upload-Progress** — Editor-Boot,
   Sidebar-Filter-List, Upload-Dropzone (~2h). Hebt "feels stable"
   deutlich. Branch: `chore/loading-skeletons-and-upload-progress`.

Erst nach diesen drei: Mobile-Konzept (das ist eigene Initiative,
nicht Bugfix).

---

## Historie

- 2026-05-05: `docs/archive/app-review.md` — erster Review, 26 Findings.
- 2026-05-06 (vormittags): `docs/archive/app-review-status.md` — alle 26
  Findings adressiert, sys-update merged, Visual-Baselines aktiviert.
- 2026-05-06 (nachmittags): `bug/filter` merged — atomic remove RPC +
  is_hidden + chain_invalid toast.
- 2026-05-06 (abends): **dieser Review** — Standortbestimmung nach
  dem Sweep, Top-3 für nächsten Sprint.
