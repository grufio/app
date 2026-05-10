# Forms — Optimization Review

Zustand: Default Forms (`components/ui/`) und App Forms (`components/ui/form-controls/app-*.tsx`) sind getrennt, FieldGroup-Komposition funktioniert, Login + Editor laufen sauber. Folgendes wäre Schliff bevor wir weitergehen.

Reihenfolge nach **Wirkung pro Aufwand** sortiert.

---

## 1. `InputGroupButton` und `InputGroupTextarea` an die App-Familie hängen

`components/ui/form-controls/input-group.tsx` definiert:
- `InputGroupButton` (Zeile 91-102) — wrapped `Button` aus `@/components/ui/button` (Default!) und zwingt es per `h-6` in Kompakt-Größe
- `InputGroupTextarea` (Zeile 77-89) — eigenständig kompakt (`text-[12px] leading-[24px] py-0`), kein App*-Pendant

Beides sind Form-Controls für die Editor-Panel-Welt, sollten also App-Familie nutzen:
- `InputGroupButton` → wrap `AppButton` statt `Button` (kein `h-6`-Override mehr nötig)
- `InputGroupTextarea` → in `app-textarea.tsx` extrahieren als `AppTextarea` mit Standalone-Chrome (border, focus etc.) plus `InputGroupTextarea` als dünner Wrapper der die Chrome entfernt — analog zu `FieldControl` ↔ `AppInput`

**Wirkung**: Konsistenz; falls jemand `InputGroupButton` außerhalb einer FieldGroup nutzt, bekommt er jetzt einen Default-Button mit erzwungenem h-6 — visueller Mismatch zu anderen App-Buttons (12px Text statt 14px).

**Aufwand**: 15-20 Min.

---

## 2. Focus-State-Inkonsistenz: `border-purple` vs `ring-purple/30`

Heute gibt es **zwei Focus-Präsentationen**:

| Surface | Visual |
|---|---|
| Bare `Input` / `Button` / `SelectTrigger` (Default) | `border-purple` + 3px `ring-purple/30` |
| Bare `AppInput` / `AppButton` / `AppSelectTrigger` (App, standalone) | `border-purple` + 3px `ring-purple/30` |
| Innerhalb `FieldGroup` | nur `border-purple` (kein Ring) |

`FieldGroup` zeigt also nie den Ring. Grund: `FieldControl` setzt `focus-visible:ring-0` um die Ring von `AppInput` zu unterdrücken (sonst würde der Ring innerhalb der Group gerendert), und `FieldGroup` selbst kompensiert das nicht.

**Optionen**:
- **A)** FieldGroup zeigt auch einen 3px-Ring um die ganze Group bei Focus eines Children → einheitlicher Look
- **B)** Alle Surfaces verzichten auf den Ring, nur `border-purple` → stiller, aber weniger erkennbar für Tastatur-Nutzer

A ist a11y-freundlicher. Implementierung: `has-[...:focus-visible]:ring-[3px] has-[...:focus-visible]:ring-purple/30` in den FieldGroup-State-Klassen ergänzen.

**Aufwand**: 5 Min.

---

## 3. `data-slot`-Lücke wenn `AppInput` direkt in `FieldGroup` ohne `FieldControl`

`FieldGroup` reagiert auf `data-slot=input-group-control` und `data-slot=select-trigger`. `AppInput` hat aber `data-slot=app-input`. Heute kein Problem weil Aufrufer immer über `FieldControl` gehen — aber:

```tsx
// Funktioniert (FieldControl überschreibt data-slot)
<FieldGroup>
  <FieldControl ... />
</FieldGroup>

// Funktioniert NICHT (AppInput-data-slot greift, FieldGroup highlightet nicht)
<FieldGroup>
  <AppInput ... />
</FieldGroup>
```

Defensive Lösung: `FieldGroup`-State-Selektoren erweitern um `[data-slot=app-input]` und `[data-slot=app-button]`. Dann ist es egal ob jemand mit oder ohne `FieldControl`-Wrapper arbeitet.

**Aufwand**: 5 Min, Risiko: niedrig.

---

## 4. CVA-Base zwischen `Button` und `AppButton` teilen

`button.tsx` und `app-button.tsx` duplizieren ~40 Zeilen Variants (default/destructive/outline/secondary/ghost/link). Die einzigen Unterschiede:
- Base-Klasse: `text-sm` vs `text-[12px] leading-[24px] py-0`
- Size: standard h-9/h-7/h-8/h-10 vs alle h-6

**Optionen**:
- **A)** Zwei separate cva-Instanzen aus einer geteilten Variants-Definition: `const baseVariants = {variant: {...}}; cva(buttonBase, {variants: {...baseVariants, size: standardSizes}})` und analog für App.
- **B)** Eine cva mit `panel: boolean` und compound-variants. Dann gibt es nur einen `Button` mit `<Button panel />` für die App-Welt.

Option A behält die expliziten `<AppButton>` und `<Button>` (die Trennung wollten wir!), reduziert aber Duplikation. Option B führt zurück zur Sorte "ein Component mit Modus-Prop", was wir gerade aufgelöst haben.

**Empfehlung A**, aber niedrige Priorität — die Duplikation ist klar abgegrenzt und der Code ist nicht groß.

**Aufwand**: 30 Min.

---

## 5. `text-[12px] leading-[24px]` wiederholt sich überall

In ~15 Stellen über alle App-Forms hinweg:
- `app-input.tsx`, `app-button.tsx`, `app-select.tsx`
- `input-group.tsx` (InputGroupText, InputGroupTextarea)
- Editor-Komponenten direkt (z.B. `field-group.tsx` Slot-Selektoren würden auch davon profitieren)

**Optionen**:
- **A)** Tailwind-Custom-Utility per `@layer utilities`: `.text-panel { @apply text-[12px] leading-[24px]; }`. Lesbarer, aber neue Konvention.
- **B)** CSS-Variable `--text-panel: 12px / 24px` in globals.css.
- **C)** Lassen — Tailwind-arbitrary-Werte sind grep-bar, die Wiederholung kein echtes Problem.

**Empfehlung C** für jetzt, A wenn das Pattern in 30+ Stellen auftaucht.

**Aufwand**: 10 Min für A, 0 für C.

---

## 6. Unklare Naming: `FieldGroup` (App-spezifisch) vs `Field` (shadcn-default)

`@/components/ui/field` (`Field`, `FieldGroup` aus shadcn login-03) und `@/components/ui/form-controls/field-group` (`FieldGroup` für App-Forms) heißen beide **FieldGroup**. Aktuell zwei verschiedene Imports verwirren leicht:

```tsx
import { Field, FieldGroup } from "@/components/ui/field"           // Default, Login-Block
import { FieldGroup } from "@/components/ui/form-controls/field-group"  // App, Panel chrome
```

In `pixelate-form.tsx` werden beide importiert (`Field` + `FieldGroup` aus `field`, App-Wrapper indirekt). Verwechslungsgefahr.

**Empfehlung**: App-Variante umbenennen zu `AppFieldGroup` / `AppFieldGroupAddon` / `AppFieldGroupText`. Konsistent mit `App*`-Convention. Schmerzhafter Schritt jetzt, aber Code danach selbsterklärend.

**Aufwand**: 30-45 Min (Import-Update über alle Editor-Field-Wrapper).

---

## 7. Filter-Dialoge — App* trotz Modal-Kontext

User hat sich für App* entschieden für Pixelate/Lineart/Numerate-Forms. Sind aber Modale, kein Inline-Panel. UX-Hinweise:
- Modale haben mehr Platz → kompakte 24px-Inputs wirken klein
- Tastatureingabe in 12px-Inputs ist auf manchen Bildschirmen anstrengend
- Standard-Modal-Pattern ist h-9 (siehe Restore/Delete-Confirm im selben Editor)

Möglicherweise einen Hybrid? `App*` für Editor-Inline, **Default** für Editor-Modale. Wäre konsistenter mit den anderen Modal-Confirms.

**Empfehlung**: später abklären basierend auf User-Feedback. Heute akzeptiert, aber Notiz wert.

**Aufwand**: 15-20 Min für eventuellen Wechsel zurück auf Default.

---

## 8. Visual-Regression-Tests

Aktuell keine. Der Sägezahn-Bug von Login → Panel → Login wäre durch ein einfaches Snapshot-Test gefangen worden:
- Surface-Snapshots: `/login`, `/dashboard`, `/projects/[id]` (Editor mit offenem Panel), Filter-Dialog open, Restore-Confirm open
- Tool: Playwright `toHaveScreenshot()` + `npm run test:e2e:visual` als Gate-Step
- Aktualisierung über `--update-snapshots`

**Wirkung**: hoch — würde alle künftigen Form-Refactors absichern.

**Aufwand**: 1-2h für Setup + 5 baseline-Snapshots.

---

## 9. Dark Mode Brand Color

`--purple: #7C5CFF` wird in `globals.css:79` (light) **und** `globals.css:114` (dark) gesetzt — beide auf gleichen Wert. Falls dark mode genutzt wird (Sidebar zeigt dunkle Themes als Option in shadcn), könnte ein helleres Lila im Dark-Mode lesbarer sein.

**Aufwand**: 2 Min, Designer-Entscheidung.

---

## 10. ARIA / Accessibility-Audit

Nicht durchgeführt. Quick-Checks:
- `FieldGroupAddon` mit Icon: hat `aria-hidden="true"` (gut)
- Inputs ohne Label im Editor (Width/Height/etc.) haben `aria-label` (gut)
- Filter-Dialog-Inputs nutzen `<Label htmlFor>` (gut)
- ColorSwatchControl mit Native `<input type="color">` — Browser-A11y greift (ok)
- Keyboard-Navigation im Editor-Panel: tabindex implizit über DOM-Reihenfolge — wäre prüfenswert ob Reihenfolge intuitiv ist

**Aufwand**: 30-60 Min für gezielten Audit.

---

## Status (Stand 2026-05-05)

| Priorität | Punkt | Status |
|---|---|---|
| Hoch | 2. Focus-Ring im FieldGroup | ✅ erledigt (Phase A1, Commit 12f447b7) |
| Hoch | 3. data-slot Lücke schließen | ✅ erledigt (Phase A2, Commit 12f447b7) |
| Mittel | 1. InputGroupButton/Textarea auf App* | ✅ erledigt — gelöscht (Phase B1) |
| Mittel | 6. AppFieldGroup-Rename | ✅ erledigt (Phase B2) |
| Mittel | 8. Visual-Regression-Tests | ✅ erledigt — `e2e/forms.visual.spec.ts`, 3 Surfaces (Phase C1) |
| Niedrig | 4. CVA-Sharing | ✅ erledigt — `buttonVariantClasses` (Phase B3) |
| Niedrig | 5. text-panel Utility | ✅ erledigt — `.text-panel` in `app/globals.css`, applied across app-input/app-button/app-select/input-group |
| Niedrig | 7. Filter-Modal Default vs App | ✅ entschieden — Filter-Dialoge nutzen App Forms (kompakt). Konsistent mit Editor-Inline. Restore/Delete-Confirm-Modale bleiben Default (sind Nicht-Editor-Modale). |
| Niedrig | 9. Dark Brand Color | ✅ obsolet — Dark Mode komplett entfernt (kein ThemeProvider/Toggle, alle `dark:`-Klassen + `.dark{}`-Block + `@custom-variant dark` raus) |
| Niedrig | 10. A11y-Audit | ✅ Quick-Audit erledigt — alle Filter-Form-Inputs haben `<Label htmlFor>`, alle Panel-Felder `aria-label`, Focus-Indikatoren mit hohem Kontrast (border-purple + ring). Keine Fixes nötig. |

**Alle 10 Punkte erledigt.** Die Form-Architektur ist abgeschlossen.
