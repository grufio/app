-- PR-2: Konsolidiere doppelte RLS-Policies auf project_images
--
-- Befund: project_images hat 8 lokale Policies (plus 4 Storage-Policies),
-- davon 4 sind direkte Duplikate, 1 ist effektiv tot:
--
--   FOR SELECT:  project_images_select_owner   == project_images_owner_select
--   FOR INSERT:  project_images_insert_owner   == project_images_owner_insert
--   FOR UPDATE:  project_images_update_owner   == project_images_owner_update
--   FOR DELETE:  project_images_delete_owner   ⊃ project_images_owner_delete_non_master
--
-- Bei FOR DELETE sind beide PERMISSIVE → werden mit OR verknüpft.
-- _delete_owner (ohne Master-Klausel) matcht immer wenn der User Owner ist,
-- macht den Master-Schutz in _owner_delete_non_master nutzlos. Master-
-- Immutability wird ohnehin durch den Trigger guard_master_immutable
-- erzwungen (mit app.deleting_project GUC-Bypass für delete_project),
-- nicht durch RLS.
--
-- Konsolidierung: behalte das _<op>_owner Naming-Schema (konsistent mit
-- project_grid, project_workspace, project_image_state, project_filter_*),
-- droppe die _owner_<op> Doppelungen.

begin;

drop policy if exists "project_images_owner_select"             on "public"."project_images";
drop policy if exists "project_images_owner_insert"             on "public"."project_images";
drop policy if exists "project_images_owner_update"             on "public"."project_images";
drop policy if exists "project_images_owner_delete_non_master"  on "public"."project_images";

commit;
