-- gruf.io - Fix/normalize RLS for project_images (owner-only)
-- Run as postgres/supabase_admin in Supabase SQL editor.

-- Ensure RLS is enabled
alter table public.project_images enable row level security;

-- Recreate policies explicitly (works with INSERT/UPDATE and UPSERT)
drop policy if exists project_images_select_owner on public.project_images;
create policy project_images_select_owner
on public.project_images for select
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
);

drop policy if exists project_images_insert_owner on public.project_images;
create policy project_images_insert_owner
on public.project_images for insert
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
);

drop policy if exists project_images_update_owner on public.project_images;
create policy project_images_update_owner
on public.project_images for update
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
);

drop policy if exists project_images_delete_owner on public.project_images;
create policy project_images_delete_owner
on public.project_images for delete
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
);

