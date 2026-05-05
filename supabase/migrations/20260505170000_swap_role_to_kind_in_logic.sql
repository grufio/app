-- Phase 4c of role -> kind migration. DB-side logic switch.
--
-- Rewrite the master-immutability trigger and the non-master-delete policy to key on
-- kind instead of role. After this, no DB rule references role anymore (only the column
-- itself plus its constraint/index variants, which phase 4d removes together with the
-- column).

create or replace function public.guard_master_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.kind = 'master' then
    raise exception using
      message = 'master image is immutable',
      detail = format('project_id=%s image_id=%s', old.project_id, old.id),
      hint = 'Use restore/activation flow instead of deleting the master image.';
  end if;

  if tg_op = 'UPDATE' and old.kind = 'master' then
    if new.name is distinct from old.name
       or new.format is distinct from old.format
       or new.width_px is distinct from old.width_px
       or new.height_px is distinct from old.height_px
       or new.storage_bucket is distinct from old.storage_bucket
       or new.storage_path is distinct from old.storage_path
       or new.file_size_bytes is distinct from old.file_size_bytes
       or new.source_image_id is distinct from old.source_image_id
       or new.crop_rect_px is distinct from old.crop_rect_px
       or new.kind is distinct from old.kind
       or new.deleted_at is distinct from old.deleted_at then
      raise exception using
        message = 'master image is immutable',
        detail = format('project_id=%s image_id=%s', old.project_id, old.id),
        hint = 'Only active pointer changes are allowed for master image rows.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

alter function public.guard_master_immutable()
  set search_path = public, pg_temp;

drop policy if exists project_images_owner_delete_non_master on public.project_images;
create policy project_images_owner_delete_non_master
on public.project_images for delete
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
  and kind <> 'master'
);
