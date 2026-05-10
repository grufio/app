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

## Findings (21 items)

| ID | Title | Size | Status | PR |
|---|---|---|---|---|
| F1 | Hardcoded UI-Meta aus Controllern in Registry | S | ✓ done | PR 1 |
| F2 | `COLOR_MODE_OPTIONS` aus `pixelate-form.tsx` in Registry | XS | ✓ done | PR 1 |
| F3 | 3-way Dispatch-Duplikation in `filter-variants.ts` | S | ✓ done | PR 1 |
| F12 | Generic `FilterResult<T>` Type | S | ✓ done | PR 1 |
| F10 | Numerate-Tests auf Pixelate-Niveau | S | ✓ done | PR 1 |
| F18 | Numerate-Performance-Profiling (User-Pain) | S | ✓ done | PR P |
| F19 | Shrink Numerate SVG payload (per-rect structure preserved) | M | superseded by F20 | — |
| F21 | Split Filter vs Trace: new sidepanel tab, mutually-exclusive Trace, separate registry/DB/API | L | open / **next, blocks F20** | TBD |
| F20 | Replace bespoke rect-loop with vtracer (numerate + lineart) | L | open (after F21) | TBD |
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
- **F19 — shrink Numerate SVG payload while keeping per-rect
  structure** *(superseded by F20)*: F19 was the tactical menu
  inside the current rect-string pipeline (numpy-vectorised
  assembly, `<defs>`+`<use>` palette, gzip transit). Empirical
  testing of vtracer (see F20) showed that the strategic rewrite
  is concrete and small enough that any work invested in F19 is
  thrown away when F20 lands. Status: kept as a fallback if F20's
  pilot reveals a blocker, otherwise drop.

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

### F21 — Split Filter vs Trace: new sidepanel tab + mutually-exclusive Trace pipeline *(open, L, **next** — blocks F20)*

Today the sidepanel "Filter" tab mixes two operationally different
concepts:
- **Filter** — bitmap-in / bitmap-out (pixelate today; RGB→BW,
  insta-style filters tomorrow). Stackable in any order.
- **Trace** — bitmap-in / vector-out (numerate, lineart). Produces
  the SVG that the rest of the product (paint-by-numbers labels,
  print export, palette legend) is built around. **Only one Trace
  result is ever active per project** — picking lineart replaces a
  prior numerate, not stacks on top.

Mixing them in one stack is the source of the F7-F8-F9 edge cases
("special-case for numerate's superpixel injection", "filter-chain
rebuild on remove") and blocks the vtracer rewrite (F20) from
landing cleanly.

**Required scope (the structural change before F20):**

1. **UI** — new sidepanel tab "Trace" between "Filter" and
   "Colors". Filter-tab keeps the stackable bitmap operations;
   Trace-tab houses Numerate + LineArt as mutually-exclusive
   choices (radio-style picker, single-active state).
2. **Registry split** — `lib/editor/filters/registry.ts` keeps
   `pixelate` (and future bitmap filters). New
   `lib/editor/trace/registry.ts` (or similar) holds `numerate`,
   `lineart`. Each has its own `FilterDefinition` analogue; F7's
   GenericFilterForm pattern can be reused for Trace if the schema
   shapes line up.
3. **DB** — `project_image_filters` (the stack) stops carrying
   numerate/lineart rows. Trace gets its own model:
   - Option A: `project_image_trace` table, single row per project
     with `(kind: "numerate"|"lineart", params jsonb,
     output_image_id, created_at)`. Replacing rebinds the row.
   - Option B: column on `projects` (single Trace per project,
     denormalised).
   Decide during F21 implementation; A is more flexible if "Trace
   history / undo" ever lands.
4. **API** — `POST /projects/:id/trace` (apply / replace),
   `DELETE /projects/:id/trace` (clear). The current
   `/filters/{numerate,lineart}` and `/images/filters` paths stop
   accepting those types.
5. **Migration** — current rows in `project_image_filters` with
   `filter_type in ('numerate','lineart')` need a migration plan.
   Decide at implementation time: best-effort port to the new
   table, or hard reset of those rows in dev/preview only if no
   prod data depends on them.
6. **Server-side filter pipeline** — `services/editor/server/
   filter-variants.ts` currently dispatches to all three.
   Numerate + lineart routes move to a new
   `services/editor/server/trace.ts` (mutually-exclusive apply,
   no chain rebuild on replace because there is no chain).

**Why before F20:** vtracer's output is the new Trace artefact; if
it landed inside the existing filter-stack, every consumer of
`project_image_filters` would need a special "is-this-actually-a-
trace" check. F21 makes the boundary explicit so F20 lands in a
single Trace surface that already speaks vector-output as its
native shape.

**Files (rough):**
- new `lib/editor/trace/registry.ts`, `lib/editor/trace/{numerate,lineart}.ts`
- new `services/editor/server/trace.ts`,
  `services/editor/server/trace-image.ts`
- new `app/api/projects/[projectId]/trace/route.ts`
- new sidepanel `Trace` tab component (mirrors existing Filter tab
  structure)
- migration: new `project_image_trace` table + drop / port of
  numerate/lineart rows in `project_image_filters`
- changes to `editor-dialog-host.tsx` to wire the Trace dialog
  separately from Filter dialogs

### F20 — Replace bespoke rect-loop with vtracer for numerate + lineart *(open, L, after F21)*

One vectorisation engine for both Trace modes (numerate + lineart),
replacing the 20K-rect string loop in numerate and unblocking the
number-annotation feature on lineart. F19 is sunk-cost-avoidance
once this is committed.

**Sequencing — straight rewrite, no pilot:** vtracer's MIT licence,
deterministic algorithm, and active 2026 maintenance plus the
empirical test below leave no real "what-if" to soft-rollout. The
correct order is: land F21 (Trace as a separate surface) → drop the
custom rects loop → call vtracer from the new Trace path → ship.

**Engine:** [vtracer](https://github.com/visioncortex/vtracer) —
Rust core, MIT, actively maintained (0.6.15 March 2026), Python
bindings via PyO3 (`pip install vtracer`), O(n) on image size.

**Empirical validation (2026-05-10).** Tested
`vtracer.convert_pixels_to_svg` on a 200×200 image with a 4×4 grid
of 50×50 cells, params:

```python
vtracer.convert_pixels_to_svg(
    rgba_pixels, size=(W, H),
    colormode="color",
    mode="polygon",
    hierarchical="cutout",      # ← key for paint-by-numbers
    filter_speckle=0,
    corner_threshold=180,       # 90° corners preserved
    length_threshold=0,
    splice_threshold=180,
    color_precision=8,
    layer_difference=0,
)
```

| Layout | Cells | Path elements | Notes |
|---|---|---|---|
| 2×2 blocks per colour (4 colours) | 16 | **4** | Connected same-colour cells merge into 1 polygon → 1 number per region (correct PBN) |
| Checkerboard (16 alternating R/B) | 16 | **16** | Disconnected same-colour cells stay separate → 1 number per cell |
| L-shape (red L + blue rest) | 16 | **2** | Each connected component = 1 polygon |

`hierarchical="cutout"` is what we want: each path element is a
disjoint region with its own `fill`, no background-stack layer.
With `"stacked"` (the default in many examples) we'd get one path
per colour with multiple subpaths plus a background-fill layer —
also workable, but cutout makes number-placement trivial because a
region == a path == one centroid.

**Pipeline shape (one engine, two modes):**
1. Quantise palette in NumPy/sklearn KMeans (already in the
   codebase for pixelate/numerate).
2. `vtracer.convert_pixels_to_svg(..., hierarchical="cutout")`.
3. Parse with `lxml`; for each path, compute polygon centroid
   (shapely / `cv2.moments`); emit `<text>` label using the palette
   index corresponding to the path's `fill`.

**Per-mode mapping:**
- *numerate* — feed the uniform-grid quantised image with
  `corner_threshold=180`, `length_threshold=0` (no smoothing). Cell
  boundaries stay 90°. Connected same-colour cells correctly merge
  into one numbered region.
- *lineart (currently outlines-only; future numbering)* — feed the
  smoothed/quantised photo with default `corner_threshold` and
  `mode="spline"` (or `polygon` with non-zero `length_threshold`).
  Same labelling code attaches numbers to the polygon centroids.

**Why not the alternatives:**
- *potrace + pypotrace* — mature but **GPL** (infects the server),
  binary-only (forces per-color-layer pipeline).
- *imagetracerjs* — public domain, browser-friendly, but quality +
  speed lag vtracer.
- *[drake7707/paintbynumbersgenerator](https://github.com/drake7707/paintbynumbersgenerator)*
  — full PBN pipeline (k-means → facets → wavelet-smoothed contours
  → numbered SVG), but unmaintained since 2019. Read as a reference
  design for the centroid + label placement heuristics; don't
  depend on it.
- AI/diffusion vectorisers — visually nice, lose discrete labelled-
  region semantics needed for PBN.

**Implementation steps (after F21 lands):**
1. New module `filter-service/app/vectorise.py` — thin vtracer
   wrapper + lxml post-process + centroid labelling.
2. Add `vtracer`, `lxml`, `shapely` to
   `filter-service/requirements.txt`.
3. Replace the bodies of `/filters/numerate` and (when numbering
   ships) `/filters/lineart` with the vtracer pipeline. The old
   rect-loop and `rects` phase are deleted in the same PR.
4. Profile-script comparison against
   `scripts/profile-fixtures/profile-1920x1080.png` to confirm
   total-ms drop and region-count parity. F19 auto-resolves.

**Files:**
- `filter-service/app/vectorise.py` (new)
- `filter-service/requirements.txt` (additions)
- `filter-service/app/main.py` (numerate / lineart endpoint
  bodies replaced)
- the new Trace pipeline on the Node side (introduced in F21) is
  the only consumer.

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
