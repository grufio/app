# Database Review — gruf.io (Supabase Postgres)

**Branch:** `feat/db-check`
**Datum:** 2026-05-05
**Status-Update:** 2026-05-11 nach DB-Bereinigungs-Serie (PR #98–#103, PR-7)
**Scope:** alle aktiven Migrations unter `supabase/migrations/`

---

## Zusammenfassung

Das Schema ist insgesamt **gesund**: RLS überall an, Owner-Pattern konsistent, Triggers gehärtet, Soft-Delete-Pattern sauber, CASCADE-Strategie kohärent.

Die im Mai 2026 durchgeführte 7-PR-Bereinigung (PR-1 … PR-7) hat 4 tote Tabellen, 4 tote RPCs, ein RLS-Doppel-Policy-Set, mehrere Legacy-Spalten und Konsolidierungspunkte abgeräumt. Die ursprünglich notierten BLOCKER/SMELL/NIT Statistiken sind unten als historisch markiert.

**BLOCKER**: 0 — keine kritischen Lücken
**SMELL**: 5 → 1 nach PR-Serie (siehe unten)
**NIT**: 3 → 1 nach PR-Serie

---

## SMELL

### 1. Doppelte Spalten `role` + `kind` auf `project_images` ✅ GELÖST (PR-6)
- `role` (Legacy: `'master'` | `'working'` | `'asset'`) existiert weiterhin neben `kind` (Enum `image_kind`: `'master'` | `'working_copy'` | `'filter_working_copy'`).
- Anwendungen filtern uneinheitlich: manche Queries auf `role`, andere auf `kind`. Beispiel: `filter-chain-reset.ts:49` filtert auf `role = 'asset' AND kind = 'filter_working_copy'`, was redundant ist.
- Backfill in `20260409120000_project_images_kind_typed.sql` mappt `role='asset'` mit Name-Heuristik → fragiles Migrations-Konstrukt.
- **Fix angewendet (PR-6 / #103)**: `role` Spalte in `project_image_state` gedroppt, ebenso die numerischen Doubletten (x, y, scale_x/y, width_px, height_px, unit, dpi). `image_role` ENUM gedroppt. `kind` auf `project_images` ist die kanonische Klassifikation.

### 2. `set_updated_at()` hat anderen `search_path` als der Rest ❌ FALSCHER ALARM
- Original-Befund: Datei `20260129111414_bootstrap_from_db_folder.sql` (frühe Definition, nicht durch `034_function_search_path_hardening` aufgehärtet). `set_updated_at`: nur `pg_catalog`.
- **Befund 2026-05-11 (`db/schema.sql:580+`)**: `set_updated_at()` hat bereits `SET search_path TO 'public', 'pg_temp'` — der Härtungs-Patch wurde irgendwann angewendet, nur die Doku-Notiz blieb stehen. Kein Handlungsbedarf.

### 3. RLS-Policy-Pattern uneinheitlich ✅ GELÖST (PR-2)
- pg_dump normalisiert alle Policies zu `IN`-Pattern, schema.sql ist
  einheitlich. Verbliebenes Problem war Naming-Inkonsistenz auf
  `project_images`: 4 Operationen hatten je zwei Policies
  (`_<op>_owner` und `_owner_<op>`) — die `_owner_<op>` Variante
  überlappte permissive mit der `_<op>_owner` Variante. Bei DELETE
  hob die `_delete_owner` (ohne Master-Klausel) den Master-Schutz
  in `_owner_delete_non_master` per OR-Verknüpfung auf — der
  echte Master-Schutz läuft sowieso über den Trigger
  `guard_master_immutable`.
- **Fix angewendet (PR-2 / #99)**: redundante `_owner_<op>` Policies gedroppt, Naming-Schema `_<op>_owner` ist Standard.

### 4. `verify-remote-rls.mjs` validiert keine Tabellen-Policies remote 🟡 OPEN
- Skript dumped nur `storage.objects`-Policies via Supabase CLI.
- Tabellen-Policies werden nur lokal gegen `bootstrap_from_db_folder.sql` geprüft.
- Lücke: ein abgeschalteter RLS-Status oder gelöschte Policy auf Remote bleibt unentdeckt.
- **Fix offen**: Skript erweitern um `pg_policies`-Dump für jede der 7 lebenden Tabellen (PR-1 hat 4 Tabellen gedroppt, Allowlist passt sich an). Nicht in der DB-Bereinigungs-Serie enthalten — eigene Story, braucht Supabase-CLI-Setup.

### 5. Service-Role-Bypass nur halb dokumentiert ✅ GELÖST (Bestand)
- Original-Fix-Vorschlag: `lib/supabase/service-role.ts`-Doc-Komment-Konvention.
- **Befund 2026-05-11**: `lib/supabase/service-role.ts:11-15` hat bereits den JSDoc-Komment "only for storage cleanup after soft-delete". Allowlist in `scripts/verify-service-role-usage.mjs` ist aktiv. Der ursprüngliche Fix wurde irgendwann angewendet.

---

## NIT

### 6. `project_image_state_role_idx` ist redundant ✅ GELÖST (PR-4 + PR-6)
- Tabelle hat `(project_id, role)` als PK. Ein zusätzlicher Index nur auf `role` (oder Composite mit identischer Spalten-Reihenfolge) bringt nichts.
- **Fix angewendet (PR-4 / #101 + PR-6 / #103)**: Index in PR-4 explizit gedroppt; in PR-6 wäre die Spalte ohnehin weg, daher mit-aufgeräumt.

### 7. Manche `ALTER COLUMN` nicht idempotent 🟢 NICHT MEHR RELEVANT
- Nach Migrations-Squash ist die Migration-History eine Baseline-Datei plus inkrementelle PR-Migrations. Re-Apply-Idempotenz ist kein Thema — frische Setups laufen einmal durch.

### 8. Text-basierte µpx-Spalten statt Domain 🟡 OPEN
- `width_px_u`, `height_px_u` etc. sind `text` mit numerischem `CHECK`-Cast. Funktioniert, aber `bigint` (oder Domain) wäre selbsterklärender und Type-sicherer auf SQL-Ebene.
- Praktisches Risiko: keines, da Code überall mit `BigInt(string)` arbeitet.
- **Status**: Im ursprünglichen PR-7-Plan war `ALTER TYPE` von TEXT → BIGINT vorgesehen. Bewusst auf einen späteren PR verschoben — supabase-js-Verhalten beim JSON-Wire-Format für `bigint` will mit Integration-Tests gegen echte DB validiert werden, das überschreitet den Scope der Offline-Bereinigung.

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

## DB-Bereinigungs-Serie 2026-05-11 (PR #98–#103, PR-7)

| PR | Inhalt | Status |
|----|--------|--------|
| #98  | Drop 4 tote Tabellen + 3 tote RPCs + 1 buggy RPC-Overload | merged-pending |
| #99  | RLS-Policy-Konsolidierung auf `project_images` (4 redundante gedroppt) | merged-pending |
| #100 | Legacy `project_grid.spacing_value` + Sync-Trigger weg | merged-pending |
| #101 | Doppel-Constraints + redundanter Index auf `project_image_state` | merged-pending |
| #102 | DPI-Konsolidierung in `project_images` (`dpi_x`, `dpi_y`, `bit_depth`, `color_space` weg) | merged-pending |
| #103 | `project_image_state` Diet (`role` + numerische Doubletten weg) | merged-pending |
| PR-7 | Status-Update dieser Doku, BIGINT-Migration deferred | dieser PR |

---

## Empfohlene Reihenfolge (historisch)

1. ~~Schritt A (klein, hohe Wirkung): `set_updated_at` search_path härten, `project_image_state_role_idx` droppen → eine Migration.~~ (Erledigt: search_path war schon gehärtet, Index in PR-4)
2. **Schritt B** (mittel): `verify-remote-rls.mjs` um Tabellen-Policies erweitern. Offen.
3. ~~Schritt C (groß, Pflicht-Audit): `role`-Spalte deprecaten — `grep` durch alle Aufrufer, schrittweise auf `kind` umstellen, am Ende Spalte droppen.~~ (Erledigt: PR-6)
4. ~~Schritt D (kosmetisch): RLS-Policies auf einheitliches `IN`-Pattern bringen.~~ (Erledigt: PR-2 + pg_dump-Normalisierung)
