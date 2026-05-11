-- PR-4: Aufräumen — doppelte Check-Constraints und redundanter Index.
--
-- 1. Doppel-Constraints auf project_image_state.
--    Die baseline-Migration definiert je zwei identische CHECK-Constraints
--    (z.B. _dpi_check und _dpi_positive). pg_dump --linked zeigt im
--    aktuellen schema.sql nur die _positive-Varianten, also existieren
--    auf Prod vermutlich nur diese (oder pg_dump dedupliziert). Lokale
--    Reapplies könnten beide haben. DROP IF EXISTS ist no-op wo bereits
--    weg, Cleanup wo doppelt.
--
-- 2. project_image_state_project_role_image_idx ist redundant zum PK
--    (project_id, image_id). Mit role dazwischen wird er nur für
--    Composite-Lookups auf role gebraucht — App-Code filtert nirgends
--    nach role auf project_image_state (grep verifiziert). Tritt zudem
--    in PR-6 ohnehin außer Kraft, wenn role gedroppt wird; vorgezogen
--    damit dieser PR isoliert bleibt.

begin;

alter table public.project_image_state
  drop constraint if exists project_image_state_dpi_check,
  drop constraint if exists project_image_state_height_px_check,
  drop constraint if exists project_image_state_width_px_check;

drop index if exists public.project_image_state_project_role_image_idx;

commit;
