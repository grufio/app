-- gruf.io - Supabase Storage RLS for bucket: project_images
-- Path convention: projects/<project_id>/<role>/<filename>
-- Run as postgres/supabase_admin in Supabase SQL editor.

-- Ensure RLS is enabled on storage.objects (it usually is, but be explicit)
alter table storage.objects enable row level security;

-- Helper predicate (inlined in each policy):
-- - bucket_id = 'project_images'
-- - name starts with projects/<uuid>/...
-- - the referenced project is owned by auth.uid()

drop policy if exists project_images_storage_select_owner on storage.objects;
create policy project_images_storage_select_owner
on storage.objects for select
using (
  bucket_id = 'project_images'
  and (storage.foldername(name))[1] = 'projects'
  and (storage.foldername(name))[3] = any (array['master','working'])
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(storage.objects.name))[2]
      and p.owner_id = auth.uid()
  )
);

drop policy if exists project_images_storage_insert_owner on storage.objects;
create policy project_images_storage_insert_owner
on storage.objects for insert
with check (
  bucket_id = 'project_images'
  and (storage.foldername(name))[1] = 'projects'
  and (storage.foldername(name))[3] = any (array['master','working'])
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(storage.objects.name))[2]
      and p.owner_id = auth.uid()
  )
);

drop policy if exists project_images_storage_update_owner on storage.objects;
create policy project_images_storage_update_owner
on storage.objects for update
using (
  bucket_id = 'project_images'
  and (storage.foldername(name))[1] = 'projects'
  and (storage.foldername(name))[3] = any (array['master','working'])
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(storage.objects.name))[2]
      and p.owner_id = auth.uid()
  )
)
with check (
  bucket_id = 'project_images'
  and (storage.foldername(name))[1] = 'projects'
  and (storage.foldername(name))[3] = any (array['master','working'])
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(storage.objects.name))[2]
      and p.owner_id = auth.uid()
  )
);

drop policy if exists project_images_storage_delete_owner on storage.objects;
create policy project_images_storage_delete_owner
on storage.objects for delete
using (
  bucket_id = 'project_images'
  and (storage.foldername(name))[1] = 'projects'
  and (storage.foldername(name))[3] = any (array['master','working'])
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(storage.objects.name))[2]
      and p.owner_id = auth.uid()
  )
);

