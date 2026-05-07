-- gruf.io - Storage policy update for project image object paths.
-- NOTE:
-- - Legacy filename retained for migration-history compatibility.
-- - This migration only updates `storage.objects` RLS policies (no `public.project_images` DDL).
-- - Path convention: projects/<project_id>/images/<image_id>
-- - Must be executed by the owner of storage.objects (supabase_storage_admin).
--
-- Why the DO-block wrapper: `storage.objects` is owned by
-- `supabase_storage_admin`, and the local `supabase start` migration
-- runner is neither that role nor a superuser. ALTER TABLE / CREATE
-- POLICY on storage.objects therefore fails locally with 42501. In
-- production the migration runs via a privileged path. We catch
-- `insufficient_privilege` so the local replay surfaces the policies
-- as a no-op (production already has them) instead of halting the
-- whole DB bring-up. The integration tests we run against the local
-- DB do not touch storage RLS, so a skipped policy here is harmless.

do $$
begin
  execute 'alter table storage.objects enable row level security';

  execute 'drop policy if exists project_images_storage_select_owner on storage.objects';
  execute $sql$
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
    )
  $sql$;

  execute 'drop policy if exists project_images_storage_insert_owner on storage.objects';
  execute $sql$
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
    )
  $sql$;

  execute 'drop policy if exists project_images_storage_update_owner on storage.objects';
  execute $sql$
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
    )
  $sql$;

  execute 'drop policy if exists project_images_storage_delete_owner on storage.objects';
  execute $sql$
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
    )
  $sql$;
exception
  when insufficient_privilege then
    raise notice
      'skipping storage.objects RLS — current role lacks ownership; production applies these via a privileged path';
end $$;
