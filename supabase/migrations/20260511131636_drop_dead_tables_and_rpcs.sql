-- PR-1: Drop tote PoC-Tabellen, tote RPCs und buggy Overload
--
-- Inventur (App-Code grep): Folgende Tabellen sind im Production-Code
-- (lib/, services/, app/, features/) nicht referenziert. Reine PoC-Reste:
--   - project_pdfs                  (PDF-Export PoC)
--   - project_filter_settings       (Filter-Konfig PoC)
--   - project_generation            (Pattern-Generation PoC)
--   - project_vectorization_settings (Vectorize PoC)
--
-- Ungenutzte RPCs (kein Aufrufer in App-Code, nicht intern via perform):
--   - set_active_master_image(uuid, uuid)
--   - set_active_master_latest(uuid)
--   - reorder_project_image_filters(uuid)
--
-- Toter Overload mit Bug:
--   - set_active_master_with_state(uuid, uuid, integer, integer)
--     verwendet ON CONFLICT (project_id, role) ohne entsprechenden
--     UNIQUE-Constraint (PK ist project_id, image_id) — würde bei
--     Aufruf mit Konflikt-Daten failen. Kein App-Caller; sichere Drops.
--
-- Hinweis: set_active_image bleibt — wird intern von der korrekten
-- µpx-Variante set_active_master_with_state(uuid, uuid, text, text, text, text)
-- aufgerufen.

begin;

drop table if exists "public"."project_pdfs" cascade;
drop table if exists "public"."project_filter_settings" cascade;
drop table if exists "public"."project_generation" cascade;
drop table if exists "public"."project_vectorization_settings" cascade;

drop function if exists "public"."set_active_master_image"("p_project_id" uuid, "p_image_id" uuid);
drop function if exists "public"."set_active_master_latest"("p_project_id" uuid);
drop function if exists "public"."reorder_project_image_filters"("p_project_id" uuid);

drop function if exists "public"."set_active_master_with_state"("p_project_id" uuid, "p_image_id" uuid, "p_width_px" integer, "p_height_px" integer);

commit;
