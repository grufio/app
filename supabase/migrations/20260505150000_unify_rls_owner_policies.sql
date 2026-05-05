-- Phase 3 of db-review cleanup.
--
-- Most tables (project_workspace, project_grid, project_pdfs, project_image_state,
-- project_vectorization_settings) already use the canonical IN-subquery owner pattern
-- after migration db/015_rls_policy_optimizations. The two stragglers below were left
-- behind on the older EXISTS form. Functional behavior is identical, but unifying the
-- pattern keeps audit/grep work simple and removes the appearance of policy drift.

drop policy if exists project_filter_settings_owner_all on public.project_filter_settings;
create policy project_filter_settings_owner_all
on public.project_filter_settings for all
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
)
with check (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

drop policy if exists project_generation_owner_all on public.project_generation;
create policy project_generation_owner_all
on public.project_generation for all
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
)
with check (
  project_id in (select id from public.projects where owner_id = auth.uid())
);
