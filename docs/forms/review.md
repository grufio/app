# Custom Forms Review: Default- vs Custom-Forms-Trennung

Ziel: zwei klar getrennte Komponenten-Familien, die sich nicht mehr gegenseitig kaputt machen können. **Default Forms** = shadcn-Standard für Login/Dialoge/öffentliche UI. **Custom Forms** = die kompakten 24px-Editor-Panel-Forms.

---

## Die zwei Familien

### Default Forms — `components/ui/`
shadcn-Standard, nichts customized:
- `Input` (h-9, text-sm, py-1, px-3)
- `Button` (h-9 default, h-7 xs, h-8 sm, h-10 lg, size-9 icon, text-sm)
- `Select` + `SelectTrigger` (h-9, text-sm, py-2)

**Zielgruppe**: alles **außerhalb** des Editor-Sidepanels — Login, Signup, Create-Project-Dialog, Filter-Apply-Dialog, Error-Boundary, Restore/Delete-Confirms.

### Custom Forms — `components/ui/form-controls/`
24px-Style für dichte Datendarstellung:
- `PanelInput` (h-6, text-[12px], leading-[24px], py-0, px-3)
- `PanelButton` (h-6 in **allen** Größen, text-[12px], leading-[24px], py-0)
- `PanelSelect` + `PanelSelectTrigger` (h-6, text-[12px], py-0)
- `FieldGroup` (Container mit `border-purple` Focus, hover-affordance, slot-shape)
- `FieldGroupAddon` (Icon/Text-Slot mit `-mr-3`-Trick für Padding-Overlap)
- `FieldGroupText` (text-[12px] leading-[24px])
- `ColorSwatchControl` (size-4 native color input)

**Zielgruppe**: Editor-Sidepanel rechts, Toolbar-Inputs, dichte Tabellen.

### Editor-Field-Wrapper — `features/editor/components/fields/`
Spezialisierte Kompositionen aus Custom-Forms:
- `IconInputGroup` (FieldGroup + Addon-Konvention)
- `PanelSizeField` (FieldGroup + NumericInput + Icon-links + Unit-rechts)
- `IconNumericField`, `IconColorField`, `IconSelectField`

Diese bleiben wo sie sind — sie nutzen die Custom-Forms.

---

## Naming-Variante: `Panel*`-Prefix

Vorgeschlagen: **`PanelInput`**, **`PanelButton`**, **`PanelSelect`**, etc.  
Warum nicht...
- `CompactInput` — beschreibt nur die Größe, nicht den Use-Case
- `CustomInput` — sagt nichts aus, jeder Wrapper ist "custom"
- `EditorInput` — eng auf Feature gebunden, andere dichte UIs (z.B. eine Daten-Tabelle) wären verwirrt
- `Panel*` — beschreibt klar wo sie hingehören (Sidebar-Panels, Toolbar) und ist generisch genug

Heute haben wir `FieldGroup` / `FieldControl` / `SelectFieldControl` — die bleiben wie sie sind, weil sie strukturell sind, nicht primitive-Ersatz.

---

## Was wo lebt

```
components/ui/              ← Default Forms (shadcn-rein)
  ├ input.tsx              ← Input (h-9, text-sm)
  ├ button.tsx             ← Button (h-9 default, alle Varianten)
  └ select.tsx             ← Select* (h-9, text-sm)

components/ui/form-controls/  ← Custom Forms
  ├ panel-input.tsx        ← PanelInput (h-6, text-[12px])  ⟵ NEU
  ├ panel-button.tsx       ← PanelButton (h-6 alle Varianten) ⟵ NEU
  ├ panel-select.tsx       ← PanelSelect, PanelSelectTrigger ⟵ NEU
  ├ field-group.tsx        ← FieldGroup, FieldGroupAddon, FieldGroupText
  ├ field-control.tsx      ← FieldControl (kann ggf. weg, wenn PanelInput selbst die transparent-Chrome hat)
  ├ select-field-control.tsx ← SelectFieldControl (gleiche Frage)
  ├ color-swatch-control.tsx ← ColorSwatchControl
  ├ input-group.tsx        ← (Helfer; ggf. private machen)
  └ index.ts               ← Re-exports

features/editor/components/fields/  ← Editor-spezifische Kompositionen (bleiben)
  ├ panel-size-field.tsx
  ├ icon-color-field.tsx
  ├ icon-numeric-field.tsx
  ├ icon-select-field.tsx
  └ icon-input-group.tsx
```

---

## Migrations-Schritte

1. **Default Forms aufräumen** (revert)  
   `Input`, `Button`, `SelectTrigger` zurück auf shadcn-Standard. Kein "compact" mehr global. Login/Dialoge sind sofort wieder okay.

2. **Custom Forms anlegen** (neu, nebenher)  
   `panel-input.tsx`, `panel-button.tsx`, `panel-select.tsx` — Inhalt: das was heute in den Primitiven steht (h-6, text-[12px], leading-[24px], py-0, plus Focus/Invalid-Pattern).

3. **`FieldControl` / `SelectFieldControl` anpassen**  
   Sie wrappen jetzt `PanelInput` / `PanelSelectTrigger` statt der Default-Primitive. Sie behalten ihren Job: Border/BG entfernen damit sie in `FieldGroup` aufgehen. Erbt Größe vom Panel-Primitive.

4. **Editor-Aufrufer migrieren**  
   Stellen die heute `<Button>` / `<Input>` / `<SelectTrigger>` direkt im Editor benutzen ohne FieldControl-Wrapper:
   - `canvas-tool-sidebar.tsx` ToolButton  
   - `grid-panel.tsx` Eye-Toggle (header)  
   - `floating-toolbar.tsx` ToolbarIconButton (das wrapped schon Button mit eigener className, ggf. unverändert)
   - alle bare `<Input>` in `pixelate-form.tsx`, `lineart-form.tsx`, `numerate-form.tsx` — **Entscheidung pro Form**: sind das Editor-Dialoge (Custom) oder Modal-Dialoge (Default)?
   
   Audit-Befehl:
   ```bash
   grep -rn "from \"@/components/ui/input\"\|from \"@/components/ui/button\"\|from \"@/components/ui/select\"" features/editor/
   ```

5. **Grenzfall: Filter-Dialoge** (Pixelate/Lineart/Numerate-Forms)  
   Die laufen im Editor, sind aber Modale mit größeren Action-Buttons. Aktuell nutzen sie bare `Input` + `Button`. Vorschlag: **Default Forms** (h-9), weil's modale Dialoge sind, nicht inline Sidebar-Felder.

6. **Verify**  
   - Login → standard h-9 Inputs/Buttons
   - Editor-Panels → kompakte 24px-Felder mit FieldGroup-Chrome
   - Filter-Dialoge → standard h-9 (Modal, nicht Panel)
   - Create-Project-Dialog → standard h-9
   - Toolbar (Floating) → eigener Stil bleibt (h-8 / size-6 SVGs)

---

## Designentscheidungen die noch offen sind

1. **`FieldControl` und `SelectFieldControl` — behalten oder droppen?**  
   Wenn `PanelInput` schon die transparente Chrome-Variante kann (rounded-none, border-0, bg-transparent), wird `FieldControl` zur dünnen Wrapper-Schicht. Optionen:
   - **Behalten**: zusätzliche Indirektions-Schicht, aber kann zukünftige Tweaks (focus-Behavior, ARIA) zentralisieren
   - **Droppen**: einfacher, weniger Files. PanelInput sieht in einer FieldGroup automatisch richtig aus.
   
   Empfehlung: erstmal behalten, später droppen wenn klar wird dass kein zusätzliches Verhalten mehr dazukommt.

2. **`InputGroupTextarea` — wo gehört das hin?**  
   Heute lebt es in `input-group.tsx`. Mit der Trennung wäre es konsistent als `PanelTextarea` in `panel-textarea.tsx`. Falls aktuell überhaupt nicht benutzt: weg damit (`grep -r "InputGroupTextarea" --include="*.tsx"` checken).

3. **Brand-Farbe `border-purple`**  
   `FieldGroup` hat eigene Focus-Klasse `border-purple` (statt shadcn-Standard `border-ring`). Wenn das eine bewusste Brand-Entscheidung ist → in beiden Familien konsistent halten? Default Forms nutzen `border-ring` heute. Klären.

4. **Tests**  
   Bisher gibt es keine visuellen Regression-Tests für Forms. Ein paar Snapshot-Tests für Login + Panel + Dialog wären hier wertvoll, sonst passiert der Sägezahn-Bug nochmal.

---

## Aufwand-Schätzung

| Schritt | Aufwand |
|---|---|
| 1. Default-Primitive revert | 10 Min (3 Files) |
| 2. Custom Forms anlegen (`PanelInput/Button/Select`) | 30 Min (Struktur kopieren, anpassen) |
| 3. FieldControl/SelectFieldControl umverdrahten | 10 Min |
| 4. Editor-Aufrufer Audit + Migration | 60-90 Min (15-20 Stellen) |
| 5. Filter-Dialog-Entscheidung umsetzen | 15 Min |
| 6. Verifikation (alle Routes durchklicken) | 30 Min |
| **Gesamt** | **~3h** |

---

## Empfehlung

Ja, machen — die Trennung löst den Konflikt **strukturell**, nicht symptomatisch. Die alten 24px-Custom-Forms kommen 1:1 zurück, nur eben unter neuen Namen (`Panel*`) und nicht mehr global aufgezwungen. Login + alle künftigen public UIs sind shadcn-konform.

Vor dem Coding würde ich klären:
- **Naming**: `Panel*` Prefix okay, oder lieber was anderes?
- **`border-purple` Brand-Farbe**: nur Editor, oder überall?
- **Filter-Dialoge** (Pixelate etc.): Default oder Custom Forms?
