# Filter-Stack Review — Findings

> **Status:** 2026-05-09 — file-level review of the filter-stack
> (UI + Registry + Server + API).
> Sister-doc to [`../forms/primitives-findings.md`](../forms/primitives-findings.md)
> in pattern.

## Scope

**UI-Layer** (`features/editor/components/`):
- `lineart-form.tsx` (163), `pixelate-form.tsx` (152),
  `numerate-form.tsx` (95) — 410 LOC
- `LineArtFilterController.tsx` (45), `PixelateFilterController.tsx` (51),
  `NumerateFilterController.tsx` (55) — 151 LOC
- `BaseFilterController.tsx` (135), `FilterSelectionController.tsx` (79)
- `filter-sidebar-section.tsx` (109)
- `filter-forms/filter-form-footer.tsx` (36) — only shared UI atom

**Registry-Layer** (`lib/editor/filters/`):
- `lineart.ts` (34), `pixelate.ts` (23), `numerate.ts` (23)
- `registry.ts` (11), `types.ts` (25)
- Tests: `registry.test.ts` (208), `python-parity.test.ts` (89)

**Server-Layer** (`services/editor/server/filters/`):
- `lineart.ts` (197), `pixelate.ts` (185), `numerate.ts` (186) — 568 LOC
- `_helpers.ts` (187) — `callFilterService()`, retry, backoff
- Tests: `lineart.test.ts` (161), `pixelate.test.ts` (192),
  `numerate.test.ts` (91)

**Orchestration** (`services/editor/server/`):
- `filter-variants.ts` (436) — dispatch + stack management
- `filter-chain.ts` (39), `filter-chain-reset.ts` (86)
- `filter-working-copy.ts` (576) — preview/working-set

**API-Routes** (`app/api/projects/[projectId]/`):
- `filters/{lineart,pixelate,numerate}/route.ts` — per-filter POST
- `images/filters/route.ts` — generic POST + GET stack
- `images/filter-working-copy/route.ts`

**Python-Bridge:** HTTP, 30s timeout, 3 retries with backoff
(250ms→4s cap). `FILTER_SERVICE_URL` + `FILTER_SERVICE_TOKEN`
env-driven.

---

## Findings (19 items)

| ID | Title | Size | Status | PR |
|---|---|---|---|---|
| F1 | Hardcoded UI-Meta aus Controllern in Registry | S | ✓ done | PR 1 |
| F2 | `COLOR_MODE_OPTIONS` aus `pixelate-form.tsx` in Registry | XS | ✓ done | PR 1 |
| F3 | 3-way Dispatch-Duplikation in `filter-variants.ts` | S | ✓ done | PR 1 |
| F12 | Generic `FilterResult<T>` Type | S | ✓ done | PR 1 |
| F10 | Numerate-Tests auf Pixelate-Niveau | S | ✓ done | PR 1 |
| F18 | Numerate-Performance-Profiling (User-Pain) | S | ✓ done | PR P |
| F19 | Shrink Numerate SVG payload (per-rect structure preserved) | M | open | TBD |
| F11 | E2E-Filter-Chain-Roundtrip-Test | M | ✓ done | PR 2 |
| F5 | Inkonsistente Registry-Metadata in Forms | M | ✓ done | PR 3 |
| F7 | Generic `<FilterForm>` aus 3 Form-Files | L | ✓ done | PR 4 |
| F8 | Generic `<FilterController>` aus 3 Controllern | M | ✓ done | PR 4 |
| F4 | Schema 2-3x parsed pro Request | M | absorbed in F9 | — |
| F9 | Generic `applyHttpFilter()` aus 3 Server-Filtern | L | open | PR 5 |
| F13 | `filter-working-copy.ts` (576 LOC) splitten | M | open | PR 6opt |
| F16 | `callFilterService()` Config per-Filter overridable | S | deferred (F18: Python = 51 ms, no timeout-pain) | PR 7opt |
| F15 | Base64 → Streaming für große Bilder | M | deferred (F18: input encode = 0.1 ms, no transit-pain) | deferred |
| F6 | Redundante API-Surface (per-filter + generisch) | M | deferred | — |
| F17 | Live-Preview während Slider-Drag | L | declined (feature) | — |
| F14 | Snake_case-Destructuring-Pattern | XS | obsolete (in F9) | — |

### F1 — Hardcoded UI-Meta aus Controllern in Registry
Title und Description leben heute in jeder `*FilterController.tsx`:
- `LineArtFilterController.tsx:28` — Title „Line Art"
- `PixelateFilterController.tsx:32` — Description
- `NumerateFilterController.tsx:32` — Description

Sollte in `FilterDefinition.meta` (oder neuem `dialog`-Feld). Picker
und Controller könnten gleiche Quelle nutzen, kein Drift.

**Files:** alle 3 `*Controller.tsx`, `lib/editor/filters/{name}.ts`,
`lib/editor/filters/types.ts`.

### F2 — `COLOR_MODE_OPTIONS` in Registry
`pixelate-form.tsx:19-22` — hardcoded Select-Options. Wenn weitere
Filter Selects bekommen, droht Copy-Paste. Pattern: Registry-Schema
kann `enum`-Variants ausdrücken; UI-Hint kann Labels hinzufügen.

**Files:** `pixelate-form.tsx`, `lib/editor/filters/pixelate.ts`,
`lib/editor/filters/types.ts`.

### F3 — 3-way Dispatch-Duplikation in `filter-variants.ts`
Zwei Stellen mit identischer Struktur:
- `normalizeFilterParams()` Lines 74-89: if/else mit identischer
  `schema.safeParse(...)` ⇒ Map.
- `createDerivedImageFromSource()` Lines 91-145: if/else mit
  identischer Result-Verarbeitung ⇒ Handler-Map.

```ts
const SCHEMAS = { pixelate: pixelateSchema, lineart: lineartSchema, numerate: numerateSchema }
const HANDLERS = { pixelate: pixelateImageAndActivate, lineart: lineArtImageAndActivate, numerate: numerateImageAndActivate }
```

**Files:** `services/editor/server/filter-variants.ts`,
`lib/editor/filters/registry.ts` (evtl. erweitern).

### F4 — Schema 2-3x parsed pro Request *(absorbed in F9)*
Heute parsen Route, `normalizeFilterParams()`, und Per-Filter-
Funktion das Schema separat. Konsolidierung passiert als Teil von
F9; kein eigenständiger PR.

### F5 — Inkonsistente Registry-Metadata-Nutzung in Forms
`lineart-form.tsx` liest `.ui.threshold1.description` etc. — viele
Felder. `pixelate-form.tsx` liest nur `.ui.num_colors` (Line 145).
`numerate-form.tsx` liest nur `.ui.stroke_width` (Line 76). Andere
Felder hardcoded.

Vorbedingung für F7. Ohne F5 kann Generic Form keine Labels
ausliefern für hardcoded Felder.

**Files:** alle 3 `{name}-form.tsx`, alle 3
`lib/editor/filters/{name}.ts`.

### F6 — Redundante API-Surface *(deferred — User-Sign-Off nötig)*
Beide existieren: `POST /filters/{name}` und
`POST /images/filters` mit `filter_type`-Dispatch. UI-Aufrufer-Audit
nötig bevor irgendwas deprecaten. Externe Konsumenten (E2E-Tests,
Webhooks) müssen geprüft werden.

### F7 — Generic `<FilterForm>` aus 3 Form-Files
Alle 3 Forms haben identische Struktur (`DEFAULT_PARAMS`, `isValid`,
`handleSubmit`, 3 unterschiedlich benannte Numeric-Converter für
identische Logik). Vorschlag: `<FilterForm filterDef={...} />` aus
Registry getrieben.

**Special-Cases:**
- Pixelate UI-State (Live-Grid) ist KEIN Filter-Param — braucht
  `helperState`-Hook in Registry.
- Numerate `superpixel_width`-Injection vor Submit — braucht
  `transformBeforeSubmit`-Hook in Registry.

**Files:** neue `generic-filter-form.tsx`, 3 alte `*-form.tsx`,
`lib/editor/filters/types.ts`.

### F8 — Generic `<FilterController>` aus 3 Controllern
Hängt an F7. Trivialer Wrapper über Generic Form, liest
`filterDef.meta`.

**Files:** 3 `*FilterController.tsx`, neue
`generic-filter-controller.tsx`, `EditorDialogHost`-Aufrufer.

### F9 — Generic `applyHttpFilter()` aus 3 Server-Filtern
3 Server-Files (568 LOC zusammen) folgen identischer 8-Schritt-
Pipeline. Vorschlag: `applyHttpFilter({ filterId, params, schema,
servicePath, ...})` in `_helpers.ts`. Per-Filter-Files werden zu
schmalen Adaptern. Absorbiert F4.

**Files:** 3 `services/editor/server/filters/{name}.ts`,
`_helpers.ts`, `filter-variants.ts`.

### F10 — Numerate-Tests aufstocken
`numerate.test.ts` (91 LOC) deutlich dünner als `pixelate.test.ts`
(192). Edge-Cases fehlen: superpixel-Bounds, lock-conflict.

**Files:** `services/editor/server/filters/numerate.test.ts`.

### F11 — E2E-Filter-Chain-Roundtrip-Test
Apply → List → Apply → List (2) → Remove → List (1) → Re-apply.
Safety-Net für F4/F9-Refactors.

**Files:** neuer/erweiterter Integration-Test.

### F18 — Numerate-Performance-Profiling *(✓ done — diagnosis below)*

**Stand:** 2026-05-10. Profiled with `scripts/profile-filters.mjs`
against the local Python service, fixture
`scripts/profile-fixtures/profile-1920x1080.png` (1920×1080,
gradient + 3 colored circles), 5 warm runs, default superpixel
10×10.

**Median per-call (Python service only, no Node pipeline):**

| filter   | total | decode | mean+expand / rects | quantize / lines | encode / serialize | output bytes |
|----------|-------|--------|---------------------|------------------|--------------------|--------------|
| pixelate | 167 ms | 0.1 ms | 37 ms (mean+expand) | 53 ms (quantize) | 75 ms (PNG encode) | 13 KB        |
| numerate | 51 ms  | 0.1 ms | 47 ms (rects loop)  | 0.1 ms (lines)   | 0.1 ms (serialize) | 1.49 MB      |

**Counter-intuitive:** Python is ~3× *faster* for numerate than for
pixelate. The user-felt slowness is not in Python's algorithm — it's
the **47 ms `rects` string-assembly loop driving a 1.49 MB SVG
output (110× larger than pixelate's 13 KB PNG)**. Confirmation:
`show_colors=false` drops numerate to 2 ms total / 23 KB output.

**Where the wall-clock goes** (qualitative, beyond Python):
- Output SVG transit: 1.49 MB Cloud Run → Vercel + Vercel → Supabase
  Storage upload + Storage → Browser fetch. Each leg dominated by
  payload size.
- Browser render of an SVG containing 20,736 `<rect>` elements
  (192×108 grid) plus ~300 `<line>`s — heavy for the DOM, paints in
  the few-hundred-ms range on default-density screens.

**Implications for queued items:**
- **F15 (Base64→Streaming)** — was *deferred*; profile shows
  base64-encode is 0.1 ms (negligible on the input side). Not hot
  for input. Output-side streaming is more interesting because that
  carries the 1.49 MB payload, but the wins are on storage/network,
  not Python. **Status: stay deferred**.
- **F16 (per-filter timeout override)** — was *hot if F18 zeigt
  Timeout-Pain*. Python finishes in 51 ms. The 30 s default isn't
  the constraint. **Status: deferred / yagni**.
- **NEW finding F19 — shrink Numerate SVG payload while keeping
  per-rect structure** *(open, M)*: the rects can't be flattened
  into a bitmap because the product later renders **paint-by-
  numbers labels** *into each `<rect>`* (the "numerate" name).
  Bitmap-style flattening (data-URL `<image>`, polygon-merge across
  color clusters) is therefore out of scope. Optimisations that
  preserve the per-rect anchor:
  - **(a) Vectorised rects assembly**: replace the 192×108 nested
    Python loop with numpy-driven bulk-string formatting → drops
    the 47 ms phase to <5 ms (algorithmic only; payload unchanged).
  - **(b) `<defs>` + `<use>` palette**: 16-256 color rects re-use
    a small `<defs>` palette via `<use href="#c12">`. Cuts the
    `fill="rgb(r,g,b)"` repetition without losing the
    individually addressable `<rect>` element. Estimated ~40-60%
    size reduction.
  - **(c) Server-side `Content-Encoding: gzip`** on the SVG
    response. SVG markup compresses 10-20×. No structural change;
    transit-only win, no client-render benefit.
  Combine (a) for Python latency, (b)+(c) for transit/render.

**Files involved:**
- `services/editor/server/filters/{numerate,pixelate}.ts` —
  Node-side phase marks gated by `PROFILE_FILTERS=1` (no overhead
  when off).
- `filter-service/app/main.py` — `PhaseTimer` always-on, returns
  `X-Profile-Phases` response header (sub-µs per mark).
- `scripts/profile-filters.mjs` — driver, requires the local
  service running.
- `scripts/profile-fixtures/profile-1920x1080.png` — deterministic
  input image.

### F12 — Generic `FilterResult<T>` Type
Jeder der 3 Server-Filter definiert lokal `Success`/`Failure`-Types.
Generic Result mit Filter-spezifischem `T` reicht.

**Files:** `_helpers.ts`, 3 `{name}.ts`.

### F13 — `filter-working-copy.ts` (576 LOC) splitten *(optional)*
Größte einzelne Datei. Vermutete Achsen: working-copy creation,
URL-signing, cleanup. Vor Split: Inhalt verifizieren — ggf. eher
Tour-Doc als Zerlegung.

**Files:** `services/editor/server/filter-working-copy.ts`.

### F14 — Snake_case-Destructuring *(obsolete)*
Verschwindet automatisch durch F9.

### F15 — Base64-Encoding RAM-Last *(deferred — Mess-Methode nötig)*
Bei 4K+ Bildern ~16-32MB RAM-Spike. Alternative: multipart/form-
data Stream. Erst Vercel Function-Dashboard prüfen ob p99 nah am
Memory-Limit; sonst YAGNI.

### F16 — `callFilterService()` Config per-Filter overridable *(optional)*
30s Timeout + 3 Retries hardcoded für alle Filter. Function-
Signatur akzeptiert Overrides, kein Caller nutzt's. Erst tun bei
konkretem Need.

### F17 — Live-Preview während Slider-Drag *(declined)*
Feature, nicht Optimierung. „Bullshit-Feature"-Risiko.

---

## Quick links

- **Pattern-Referenz:** [../forms/primitives-findings.md](../forms/primitives-findings.md)

> Der Execution-Plan zu diesem Doc lebt außerhalb des Repos in
> Claude's Plans-Ordner und ist nach Abschluss aller PRs
> wegwerfbar.
