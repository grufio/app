-- gruf.io - Update storage policies for new image paths
-- Path convention: projects/<project_id>/images/<image_id>
-- NOTE: Must be executed by the owner of storage.objects (supabase_storage_admin).

alter table storage.objects enable row level security;

drop policy if exists project_images_storage_select_owner on storage.objects;
create policy project_images_storage_select_owner
on storage.objects for select
using (
  bucket_id = 'project_images'
  and (
    name ~ '^projects/[0-9a-fA-F-]{36}/images/[0-9a-fA-F-]{36}$'
    or name ~ '^projects/[0-9a-fA-F-]{36}/(master|working)/'
  )
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
  and (
    name ~ '^projects/[0-9a-fA-F-]{36}/images/[0-9a-fA-F-]{36}$'
    or name ~ '^projects/[0-9a-fA-F-]{36}/(master|working)/'
  )
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
  and (
    name ~ '^projects/[0-9a-fA-F-]{36}/images/[0-9a-fA-F-]{36}$'
    or name ~ '^projects/[0-9a-fA-F-]{36}/(master|working)/'
  )
  and exists (
    select 1
    from public.projects p
    where p.id::text = substring(storage.objects.name from '^projects/([0-9a-fA-F-]{36})/')
      and p.owner_id = auth.uid()
  )
)
with check (
  bucket_id = 'project_images'
  and (
    name ~ '^projects/[0-9a-fA-F-]{36}/images/[0-9a-fA-F-]{36}$'
    or name ~ '^projects/[0-9a-fA-F-]{36}/(master|working)/'
  )
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
  and (
    name ~ '^projects/[0-9a-fA-F-]{36}/images/[0-9a-fA-F-]{36}$'
    or name ~ '^projects/[0-9a-fA-F-]{36}/(master|working)/'
  )
  and exists (
    select 1
    from public.projects p
    where p.id::text = substring(storage.objects.name from '^projects/([0-9a-fA-F-]{36})/')
      and p.owner_id = auth.uid()
  )
);
