# Database Review — gruf.io (Supabase Postgres)

**Branch:** `feat/db-check`  
**Datum:** 2026-05-05  
**Scope:** alle aktiven Migrations unter `supabase/migrations/`

---

## Zusammenfassung

Das Schema ist insgesamt **gesund**: RLS überall an, Owner-Pattern konsistent, Triggers gehärtet, Soft-Delete-Pattern sauber, CASCADE-Strategie kohärent. Drei strukturelle Punkte verdienen Aufmerksamkeit (legacy `role`-Spalte, Storage-Cleanup-Path, Remote-RLS-Verifikation), der Rest sind kleine Glättungen.

**BLOCKER**: 0 — keine kritischen Lücken  
**SMELL**: 5 — strukturelle Schulden  
**NIT**: 3 — kleine Konsistenz-Fragen

---

## SMELL

### 1. Doppelte Spalten `role` + `kind` auf `project_images`
- `role` (Legacy: `'master'` | `'working'` | `'asset'`) existiert weiterhin neben `kind` (Enum `image_kind`: `'master'` | `'working_copy'` | `'filter_working_copy'`).
- Anwendungen filtern uneinheitlich: manche Queries auf `role`, andere auf `kind`. Beispiel: `filter-chain-reset.ts:49` filtert auf `role = 'asset' AND kind = 'filter_working_copy'`, was redundant ist.
- Backfill in `20260409120000_project_images_kind_typed.sql` mappt `role='asset'` mit Name-Heuristik → fragiles Migrations-Konstrukt.
- **Fix**: `role` deprecaten und entfernen, sobald alle Aufrufer auf `kind` umgestellt sind. Code-Audit nötig (`grep -r "role.*=.*'asset'"`).

### 2. `set_updated_at()` hat anderen `search_path` als der Rest
- Datei: `20260129111414_bootstrap_from_db_folder.sql` (frühe Definition, nicht durch `034_function_search_path_hardening` aufgehärtet).
- Alle anderen Funktionen: `set search_path = public, pg_temp`. `set_updated_at`: nur `pg_catalog`.
- **Fix**: `alter function public.set_updated_at() set search_path = public, pg_temp` als Migration.

### 3. RLS-Policy-Pattern uneinheitlich
- Frühe Tabellen (`projects`, `project_workspace`, `project_grid`, `project_pdfs`, `project_filter_settings`, `project_generation`, `project_image_state`):  
  `using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()))`
- Spätere Tabellen (`project_images`, `project_image_filters`):  
  `using (project_id in (select id from public.projects where owner_id = auth.uid()))`
- Funktional äquivalent, aber Audit/Diff schwerer.
- **Fix**: einheitliches Pattern erzwingen (das `IN`-Pattern ist kürzer und deckt mehrere Tabellen schneller ab).

### 4. `verify-remote-rls.mjs` validiert keine Tabellen-Policies remote
- Skript dumped nur `storage.objects`-Policies via Supabase CLI.
- Tabellen-Policies werden nur lokal gegen `bootstrap_from_db_folder.sql` geprüft.
- Lücke: ein abgeschalteter RLS-Status oder gelöschte Policy auf Remote bleibt unentdeckt.
- **Fix**: Skript erweitern um `pg_policies`-Dump für jede der 9 Tabellen.

### 5. Service-Role-Bypass nur halb dokumentiert
- Genutzt in `services/editor/server/filter-variants.ts:192` für Storage-Cleanup (Owner-Client kann RLS-erlaubt nicht aus dem Bucket löschen, weil das Bild bereits soft-deletet ist).
- Pattern ist legitim, aber an einer Stelle vergraben. Andere Aufrufer könnten die Konvention nicht kennen.
- **Fix**: Eine `lib/supabase/service-role.ts`-Doc-Komment-Konvention: nur Storage-Cleanup nach Soft-Delete.

---

## NIT

### 6. `project_image_state_role_idx` ist redundant
- Tabelle hat `(project_id, role)` als PK. Ein zusätzlicher Index nur auf `role` (oder Composite mit identischer Spalten-Reihenfolge) bringt nichts.
- **Fix**: `drop index if exists project_image_state_role_idx`.

### 7. Manche `ALTER COLUMN` nicht idempotent
- Beispiel: `20260409120000`: `alter column kind set not null` — fehlschlägt, wenn re-applied bei NULL-Werten.
- Praktisches Risiko niedrig (Migrations sind one-shot).
- **Fix**: Falls Wiederholbarkeit gewünscht, `do $$ begin if exists (...) then ... end if; end $$`-Wrapper.

### 8. Text-basierte µpx-Spalten statt Domain
- `width_px_u`, `height_px_u` etc. sind `text` mit numerischem `CHECK`-Cast. Funktioniert, aber Domain (`create domain micro_px as bigint check (...)`) wäre selbsterklärender und Type-sicherer auf SQL-Ebene.
- Praktisches Risiko: keines, da Code überall mit `BigInt(string)` arbeitet.

---

## OK (verifiziert sauber)

- **Aktive-Image-Uniqueness**: `project_images_one_active_image_idx` (UNIQUE auf `project_id` WHERE `is_active AND deleted_at IS NULL`) garantiert genau ein aktives Bild pro Projekt — deckt master/working_copy/filter_working_copy gemeinsam ab.
- **`source_image_id`-FK**: `ON DELETE RESTRICT` — verhindert Hard-Delete eines Bildes, das als Source referenziert wird. Soft-Delete bleibt möglich.
- **`guard_master_immutable`-Trigger**: blockiert UPDATE auf relevante Master-Felder UND DELETE auf Master-Rows. Bug der Filter-Chain-Architektur war außerhalb dieses Triggers.
- **Filter-Chain-Atomicity**: `append_project_image_filter` nutzt `pg_advisory_xact_lock` und prüft Tip-Mismatch — verhindert Race-Conditions beim parallelen Filter-Apply.
- **Storage-RLS**: vollständige CRUD-Policies auf `storage.objects` mit Bucket+Pfad-Validierung und Owner-Check.
- **Soft-Delete-Konsistenz**: `deleted_at`-Filter wird in allen RPCs und in den meisten App-Queries angewendet.
- **CASCADE-Strategie**: `project → project_*` mit `ON DELETE CASCADE`, FKs zwischen images mit `ON DELETE RESTRICT`. Datenverlust durch versehentliches Löschen ausgeschlossen.

---

## Empfohlene Reihenfolge

1. **Schritt A** (klein, hohe Wirkung): `set_updated_at` search_path härten, `project_image_state_role_idx` droppen → eine Migration.
2. **Schritt B** (mittel): `verify-remote-rls.mjs` um Tabellen-Policies erweitern.
3. **Schritt C** (groß, Pflicht-Audit): `role`-Spalte deprecaten — `grep` durch alle Aufrufer, schrittweise auf `kind` umstellen, am Ende Spalte droppen.
4. **Schritt D** (kosmetisch): RLS-Policies auf einheitliches `IN`-Pattern bringen (eine Migration, viele `drop policy` + `create policy`).
