-- gruf.io - RLS policy optimizations (owner-only)
--
-- Goal: reduce per-row correlated subqueries in RLS by using a semi-join friendly predicate.
-- This keeps semantics identical (owner-only), but tends to plan better on larger tables.

-- Child tables: owner-only via parent project membership (semi-join pattern).
-- Note: projects is already RLS-restricted to owner-only, but we explicitly check owner_id for clarity.

-- project_images
drop policy if exists project_images_owner_all on public.project_images;
create policy project_images_owner_all
on public.project_images for all
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
)
with check (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

-- project_workspace
drop policy if exists project_workspace_owner_all on public.project_workspace;
create policy project_workspace_owner_all
on public.project_workspace for all
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
)
with check (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

-- project_grid
drop policy if exists project_grid_owner_all on public.project_grid;
create policy project_grid_owner_all
on public.project_grid for all
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
)
with check (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

-- project_vectorization_settings
drop policy if exists project_vec_owner_all on public.project_vectorization_settings;
create policy project_vec_owner_all
on public.project_vectorization_settings for all
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
)
with check (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

-- project_pdfs
drop policy if exists project_pdfs_owner_all on public.project_pdfs;
create policy project_pdfs_owner_all
on public.project_pdfs for all
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
)
with check (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

-- project_image_state (created in db/007_project_image_state.sql)
drop policy if exists project_image_state_owner_all on public.project_image_state;
create policy project_image_state_owner_all
on public.project_image_state for all
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
)
with check (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

-- Storage policies: avoid repeated foldername() calls; use regex + substring extraction.
-- Path convention: projects/<project_id>/<role>/<filename>
drop policy if exists project_images_storage_select_owner on storage.objects;
create policy project_images_storage_select_owner
on storage.objects for select
using (
  bucket_id = 'project_images'
  and name ~ '^projects/[0-9a-fA-F-]{36}/(master|working)/'
  and exists (
    select 1
    from public.projects p
    where p.id::text = substring(storage.objects.name from '^projects/([0-9a-fA-F-]{36})/')
      and p.owner_id = auth.uid()
  )
);

drop policy if exists project_images_storage_insert_owner on storage.objects;
create policy project_images_storage_insert_owner
on storage.objects for insert
with check (
  bucket_id = 'project_images'
  and name ~ '^projects/[0-9a-fA-F-]{36}/(master|working)/'
  and exists (
    select 1
    from public.projects p
    where p.id::text = substring(storage.objects.name from '^projects/([0-9a-fA-F-]{36})/')
      and p.owner_id = auth.uid()
  )
);

drop policy if exists project_images_storage_update_owner on storage.objects;
create policy project_images_storage_update_owner
on storage.objects for update
using (
  bucket_id = 'project_images'
  and name ~ '^projects/[0-9a-fA-F-]{36}/(master|working)/'
  and exists (
    select 1
    from public.projects p
    where p.id::text = substring(storage.objects.name from '^projects/([0-9a-fA-F-]{36})/')
      and p.owner_id = auth.uid()
  )
)
with check (
  bucket_id = 'project_images'
  and name ~ '^projects/[0-9a-fA-F-]{36}/(master|working)/'
  and exists (
    select 1
    from public.projects p
    where p.id::text = substring(storage.objects.name from '^projects/([0-9a-fA-F-]{36})/')
      and p.owner_id = auth.uid()
  )
);

drop policy if exists project_images_storage_delete_owner on storage.objects;
create policy project_images_storage_delete_owner
on storage.objects for delete
using (
  bucket_id = 'project_images'
  and name ~ '^projects/[0-9a-fA-F-]{36}/(master|working)/'
  and exists (
    select 1
    from public.projects p
    where p.id::text = substring(storage.objects.name from '^projects/([0-9a-fA-F-]{36})/')
      and p.owner_id = auth.uid()
  )
);

