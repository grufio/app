# Analyse: „Kontur von Trace" kaputt — Ursprung = DPR-Umstellung

_Repo: `grufio/app` · Stand: HEAD `3b1ff3b` (#650) · erstellt 2026-07-19_

> **Geltungsbereich: nur das fertiggestellte (angewendete) Trace-Bild.**
> Die Config-**Preview** ist eine bewusst approximative Vorschau und **kein**
> Gegenstand dieser Analyse. Was die Preview-Linie tut, ist für die Kontur des
> Fertigbilds irrelevant und wird hier weder als Beleg noch als Fix herangezogen.

## TL;DR (Kurzbefund)

- „Kontur" = die **schwarzen Region-Umrisse** des **angewendeten** Trace (Paint-by-Numbers-Linien).
- Das Fertigbild hat **zwei getrennte Render-Pfade** für dieselbe Kontur:
  1. **Pixelate/Circulate** → auf der **Konva-Canvas** als Hairline `strokeWidth = 1/dpr`, `strokeScaleEnabled:false`.
  2. **Linerate** (früher „lineart") → als **DOM-SVG** in `TraceInlineSvg`, vom Server (`linerate.py`) mit `stroke-width="1"` auf einem viewBox in **Quell-Pixeln**, gestreckt via `preserveAspectRatio="none"`.
- **Der Ursprung liegt bei #597** (06.07., „render trace lines as a true 1-device-pixel hairline"): dort wurde die Kontur des Fertigbilds auf **1 physisches Device-Pixel (`1/dpr`)** umgestellt — aber **nur für den Konva-Pfad**. Der SVG-Pfad blieb außen vor.
- **Diese Umstellung war Drift** (s. §7): sie hat keinen funktionalen Bug behoben — „1 CSS-Pixel" (= 2 Device-px auf Retina) ist das normale, korrekte, knackige Rendering. #597 hat daraus per Geschmacksentscheidung „genau 1 physisches Pixel" gemacht und das zur **globalen Invariante** erhoben, die der SVG-Pfad strukturell nicht erfüllen kann.
- **Linerate kam einen Tag später (#607, 07.07.)** und brachte den SVG-Kontur-Pfad mit — konnte die neue `1/dpr`-Invariante also nie einhalten. Das löste die spätere Fix-Kette am Fertigbild aus: **#647 → #649 → #650** (davon heben sich #647/#649 netto auf).
- **Grundursache:** Bei der DPR-Umstellung wurde **kein einheitlicher Kontur-Vertrag** über die Render-Ebenen des Fertigbilds gezogen. Die Breite wird an **drei Stellen in zwei Ebenen** unabhängig definiert (Konva-Client, DOM-CSS-Client, Python-Server) → jede neue Trace-Art / jede Auflösungsänderung reißt sie wieder auseinander.

> Begriffsklärung: „DDR/TPR Umstellung von DX" lese ich als **„DPR-Umstellung"** (device pixel ratio).

---

## 1. Was genau ist „die Kontur"?

Ein **angewendeter** Trace besteht aus **Farbregionen** (die auszumalenden Felder) + deren **schwarzen Umrissen** (der Kontur) + optional **Zahlen**. „Kontur kaputt" heißt: die Umrisslinie des Fertigbilds ist **zu dick / zu dünn / skaliert falsch mit dem Zoom** und **passt nicht zu den anderen Trace-Arten**.

Drei Kinds mit unterschiedlichem Kontur-Rendering im **Fertigbild**:

| Kind | Kontur gerendert in | Breite definiert durch |
|---|---|---|
| Pixelate | Konva-Canvas | `getStaticLineRenderProps(1/dpr)` (Device-Pixel-Hairline) |
| Circulate | Konva-Canvas | `strokeWidth = 1/dpr`, `strokeScaleEnabled:false` |
| Lineart | (entfernt in #636) | — |
| **Linerate** | **DOM-SVG (`TraceInlineSvg`)** | **Server `stroke-width="1"` in Quell-px + Client-CSS `1/dpr`** |

Der Bruch entsteht **an der Naht zwischen Konva-Pfad und SVG-Pfad**.

---

## 2. Der Ursprung: die DPR-Umstellung (#597 / #598, 06.07.)

Vorgeschichte (legitim): **#571 (04.07.) + #575 (05.07.)** haben die Trace-Zellen/Linien aus dem gestreckten DOM-SVG auf die **Konva-Canvas** verlegt, weil eine SVG-`<line>` in einem `preserveAspectRatio="none"`-viewBox auf **fraktionale Device-Pixel** fiel und zu einer weichen, grauen Linie antialiaste. Das war ein **echter, sichtbarer Defekt**, und der Fix nutzte die **bereits vorhandene** Artboard-Pixel-Snap-Maschinerie (`snapWorldToDeviceHalfPixel`, `strokeScaleEnabled=false`).

Dann **#597 `feat(trace): render trace lines as a true 1-device-pixel hairline`**:

- Begründung, **selbst-diagnostiziert und rein ästhetisch**: „Trace grid/frame lines looked ~2 device px thick on Retina."
- Änderung: von „1 CSS-px" auf **`strokeWidth = 1/dpr`** + `strokeScaleEnabled:false` → exakt **1 physisches Device-Pixel, zoom-konstant**.
- Neu eingeführt: `device-pixel-ratio.ts` (SSR-sicherer Getter + reaktiver Hook), DPR-bewusste `pixel-snap.ts`.
- Ausdrücklich **„applied uniformly"** — aber nur auf **Pixelate-/Circulate-Konva-Overlays**. Ein SVG-Kontur-Pfad existierte hier noch nicht.

➡️ **Ab hier war „Kontur = genau 1 physisches Pixel" die globale Regel — aber nur auf der Konva-Ebene.**

Belege:
- `features/editor/components/canvas-stage/device-pixel-ratio.ts`
- `features/editor/components/canvas-stage/pixel-snap.ts`
- `features/editor/components/canvas-stage/circulate-trace-overlay.tsx:47-50`
- `features/editor/components/canvas-stage/pixelate-trace-overlay.tsx:92-96`
- Commits `2b872d6` (#571), `f610e5b` (#575), `9f3a386` (#597), `8885111` (#598)

---

## 3. Warum Linerate außen vor blieb (#607, 07.07.)

**Einen Tag nach** der DPR-Umstellung kam **#607 `feat(trace): new "linerate" model"`**. Linerate erzeugt seine Regionen **serverseitig als SVG** (`filter-service/app/linerate.py`) und rendert sie im Fertigbild als **DOM-SVG** (`TraceInlineSvg`), nicht auf Konva.

Der Server schrieb von Anfang an:

```python
# linerate.py (heute ~Zeile 623)
f'<path d="{d}" fill="#{r:02x}{g:02x}{b:02x}" stroke="black" '
f'stroke-width="{line_thickness}" fill-rule="evenodd"/>'   # line_thickness = 1.0
```

Also **`stroke-width="1"` in Quell-Pixel-Koordinaten** (viewBox = Quellauflösung), das SVG per `preserveAspectRatio="none"` auf den Anzeige-Rahmen **gestreckt**.

➡️ Damit konnte die Linerate-Kontur die `1/dpr`-Invariante aus #597 **nie erfüllen** — ein zweites, davon unabhängiges Kontur-Modell im selben Fertigbild. Genau das ist der „Ursprung, der davor liegt".

---

## 4. Die Fix-Kette am Fertigbild (die „mehreren PRs")

Es gibt **keine offenen PRs** — die „mehreren Versuche" sind die bereits **gemergte** Kette (alle am 19.07.). _(#641 betraf nur die Preview und ist hier bewusst nicht Teil der Kette.)_

### #647 `fix(linerate): applied trace outline is a constant non-scaling hairline` (14:48)
Diagnose: Apply-SVG hat `stroke-width=1` **ohne** `vector-effect="non-scaling-stroke"` → skaliert mit der Auflösung. **Fix am Server** (`linerate.py`): `non-scaling-stroke` ergänzt. **Falsche Annahme** — s. #649.

### #649 `fix(linerate): revert the non-scaling trace stroke` (15:26)
**Revert von #647.** Erkenntnis: Da der viewBox die **Quellauflösung** ist, skaliert `stroke-width=1` **herunter** zu Sub-Pixel, wenn die Trace kleiner als die Quelle dargestellt wird — **genau das** war die gewünschte dünne Hairline. `non-scaling-stroke` fixierte sie auf konstante 1 px → **zu dick**. Wieder entfernt (Zustand wie seit #607).

➡️ **#647 + #649 heben sich gegenseitig auf** — zwei PRs, netto keine Server-Änderung, weil auf der **falschen Ebene** (Server-SVG) gearbeitet wurde.

### #650 `fix(trace): crisp 1-device-pixel hairline for the applied linerate outlines` (16:23, = HEAD)
**Richtige Ebene endlich erkannt:** Die dargestellte Breite gehört in den **Client**, weil das SVG gestreckt wird. Fix in `trace-inline-svg.tsx`: CSS

```css
[data-testid="trace-inline-svg"] [data-trace-region] {
  stroke-width: 1/dpr px;             /* wie die Konva-Overlays */
  vector-effect: non-scaling-stroke;  /* konstant trotz Streckung */
}
```

Der Server-SVG bleibt unangetastet; das CSS **überschreibt** das inline `stroke-width="1"`. Damit ist die Linerate-Kontur des Fertigbilds dieselbe 1-Device-Pixel-Hairline wie Pixelate/Circulate — d. h. sie erbt exakt die #597-Drift.

---

## 5. Aktueller Stand des Fertigbilds (nach #650)

- Die **angewendete** Linerate-Kontur ist eine **1-Device-Pixel-Hairline (`1/dpr`) + `non-scaling-stroke`** im Client-CSS und passt visuell zu Pixelate/Circulate. ✅
- Der **Server** (`linerate.py`) emittiert weiterhin `stroke-width="1"` (Quell-px) — jetzt bewusst, da vom Client-CSS überschrieben (dokumentiert in `linerate.py:619-624`).
- Damit hängt die Kontur des gesamten Fertigbilds an der `1/dpr`-Invariante aus #597 — inklusive deren offener Frage „ist 1 physisches Pixel zu fein?" (nie visuell abgenommen, s. §7 / §9).

---

## 6. Zeitachse (Fertigbild)

| Datum | PR | Wirkung auf die Kontur des Fertigbilds |
|---|---|---|
| 04.–05.07. | #571 / #575 | Zellen/Linien von gestrecktem DOM-SVG → Konva (echter Blur-Bug behoben). **Legitim.** |
| 06.07. | **#597** | DPR-Umstellung: Konva-Kontur → `1/dpr` Device-Pixel-Hairline. **Ursprung / Drift.** |
| 06.07. | #598 | Artboard-Fill/Veil auf ganze Device-px gesnappt. |
| 07.07. | **#607** | Linerate: **eigener** Server-SVG-Kontur-Pfad (`stroke-width=1`, Quell-px). Divergenz entsteht. |
| 19.07. | #647 | Server: `non-scaling-stroke` — **falsch**. |
| 19.07. | #649 | **Revert** von #647. |
| 19.07. | **#650** | Client-CSS: `1/dpr` + `non-scaling-stroke` — Apply-Kontur an #597 angeglichen. **= HEAD.** |

---

## 7. Grundursache (Root Cause)

### 7.1 #597 war Drift, nicht Bugfix
„1 CSS-Pixel = 2 Device-Pixel auf Retina" ist das normale, korrekte Rendering — nicht defekt. #597 hat daraus eine **unbestätigte Geschmacksentscheidung** („looked … thick") gemacht und sie als **globale Invariante** („applied uniformly") gesetzt. Indizien für Drift:
- **Keine User-Meldung** (vgl. die display-px-Story in §7.3, die explizit „User-verified" ist).
- **Ohne visuelle Abnahme gemergt** — #597 selbst: „the final visual acceptance (is 1 device px too fine?) is an in-browser check" (nicht geliefert).
- **Zur universellen Regel erhoben**, obwohl ein paralleler Render-Pfad (SVG, `preserveAspectRatio="none"`) sie strukturell nicht erfüllen kann.

### 7.2 Kein einheitlicher Kontur-Vertrag über die Render-Ebenen
Die `1/dpr`-Regel lebt **implizit im Konva-Code**, nicht als geteilter Vertrag. Als Linerate (#607) einen **zweiten Render-Weg** (DOM-SVG/Server) einführte, gab es keinen gemeinsamen Ort, der die Kontur erzwingt. Die Breite wird an **drei Stellen** unabhängig gesetzt:

- Konva: `1/dpr` (`circulate-/pixelate-trace-overlay.tsx`)
- DOM-CSS: `1/dpr` (`trace-inline-svg.tsx`, seit #650)
- Server-SVG: `stroke-width=1` in Quell-px (`linerate.py`)

Jede Stelle kann die anderen wieder brechen — die Kette #647/#649/#650 ist das Symptom dieser fehlenden Zentralisierung; #647/#649 verbrannten einen Zyklus an der **falschen Ebene**.

### 7.3 Verwandter, tieferliegender Strang: „display px vs. source px"
`preserveAspectRatio="none"` + viewBox = Quellauflösung ist selbst Symptom einer dokumentierten Bug-Klasse: die **Geometrie des angewendeten** Overlays folgte lange dem **Quell-Bitmap** statt der eingestellten **Display-Größe**. Belege (beides Fertigbild-Gates):
- `e2e/trace-overlay-aspect.spec.ts` („the render gate that was missing for ~30 PRs")
- `e2e/trace-overlay-display-pixels.spec.ts` („~120 PRs"; prod-Symptom: Trace rendert in Quell-Bitmap-Pixeln statt der gesetzten 283×567 px)

Gemeinsame Wurzel mit §7.2: **die Kontur-/Geometrie-Definition des Fertigbilds ist über mehrere Ebenen verstreut statt an einer Stelle.**

---

## 8. Empfehlung (Fertigbild)

1. **#597 in der Zielsetzung zurücknehmen.** Trace-Konturen des Fertigbilds als **1 CSS-Pixel** rendern (Konva `strokeWidth: 1`; Linerate: das Server-`stroke-width="1"` einfach wirken lassen, **kein** Client-CSS-Override). Knackig genug dank des Konva-Moves aus #571/#575, **ohne** den `1/dpr`-Sonderweg, der die Ebenen gegeneinander laufen lässt.
2. **Falls die feine Hairline gewollt bleibt:** einen **einzigen** Kontur-Vertrag zentralisieren — z. B. `getTraceOutlineStroke(dpr)` → `{ strokeWidth, nonScaling }` —, den **beide** Fertigbild-Pfade (Konva-Props **und** DOM-CSS) konsumieren. Dann kann keine neue Trace-Art die Kontur mehr divergieren lassen.
3. **Server aus der Breiten-Definition heraushalten.** `linerate.py` bleibt struktureller Platzhalter (`stroke-width="1"`); **nie** wieder `vector-effect` serverseitig (Lehre aus #647/#649). Genau eine Ebene ist Quelle der Wahrheit für die dargestellte Breite.
4. **Regressionstest am Fertigbild.** Ein Test, der die **gerenderte Kontur-Breite** (Device-px) für **alle** Trace-Kinds im angewendeten Ergebnis vergleicht, hätte #647 sofort gestoppt. Die Konva-Overlays haben aktuell keine Unit-Coverage und der E2E-Trace-Mock mountet sie nicht (Zitat #597).

---

## 9. Offene Punkte / Verifikation

- **e2e-Status:** #597 notierte, `e2e/trace-overlay-{aspect,display-pixels}.spec.ts` seien „pre-existing failing on clean main". Ob auf aktuellem HEAD grün, wurde hier **nicht** ausgeführt (braucht laufende App).
- **Visuelle Abnahme:** ob „1 physisches Device-Pixel" zu fein ist, ist laut #597 selbst eine offene In-Browser-Prüfung — für Konva-Overlays **und** die #650-CSS-Kontur.

---

## 10a. Umsetzung (Branch `claude/trc-trace-kontur-fehler-1bt7bw`)

Der empfohlene Fix ist umgesetzt: **eine konsistente Haarlinie über alle Trace-Arten**.

- **Single Source of Truth:** neue Konstante `TRACE_CONTOUR_STROKE_CSS_PX = 1` in `line-rendering.ts`, konsumiert von allen drei Kontur-Pfaden.
- **Wert = 1 CSS-Pixel (statt `1/dpr`):** entscheidend aus Konsistenzgründen — die Konva-Pfade sind pixel-gesnappt (bei `1/dpr` satt), der Linerate-DOM-SVG-Pfad kann **nicht** snappen (bei `1/dpr` → blasse graue, antialiaste Linie). Bei vollem 1 CSS-px rendern **beide** Substrate eine solide Haarlinie. Nebeneffekt: entspricht dem Zustand vor #597 und dem Artboard-Grid.
- **Betroffen:** `pixelate-trace-overlay.tsx`, `circulate-trace-overlay.tsx`, `trace-inline-svg.tsx` (CSS-Override bleibt, nur Wert → Konstante), `linerate.py` (nur Kommentar; Server bleibt struktureller Platzhalter, **kein** `vector-effect`).
- **Regressionstest:** `line-rendering.test.ts` — Konstante = 1, non-scaling; plus Guard, dass alle drei Overlays die Konstante importieren und kein `1/dpr`-Stroke mehr inline steht.
- **Nicht geändert:** geteilte Snap-Infrastruktur (`pixel-snap.ts`, `device-pixel-ratio.ts`), Artboard/Selection.

## 10. Belegstellen

- Legitime Vorgeschichte: `2b872d6` (#571), `f610e5b` (#575)
- Ursprung/Drift DPR: `9f3a386` (#597), `8885111` (#598)
- Linerate-Einführung: `94ced36` (#607)
- Fix-Kette Fertigbild: `5639759` (#647), `293b0fc` (#649), `3b1ff3b` (#650, HEAD)
- Kontur-Code heute:
  - `features/editor/components/canvas-stage/trace-inline-svg.tsx` (SVG-Kontur, #650-CSS)
  - `features/editor/components/canvas-stage/circulate-trace-overlay.tsx`, `pixelate-trace-overlay.tsx` (Konva-Kontur)
  - `features/editor/components/canvas-stage/device-pixel-ratio.ts`, `pixel-snap.ts`
  - `filter-service/app/linerate.py:619-624` (Server-SVG-Kontur + #647/#649-Kommentar)
- Geometrie-Vertrag: `docs/reference/pixel-geometry-contract.md`
- Render-Gates (Fertigbild): `e2e/trace-overlay-aspect.spec.ts`, `e2e/trace-overlay-display-pixels.spec.ts`
