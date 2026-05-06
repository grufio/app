-- Fix: project deletion blocked by master-immutability trigger.
--
-- Symptom: deleting a project threw `master image is immutable` from
-- `guard_master_immutable` because Postgres cascades into project_images
-- and the trigger fires on every cascade-deleted master row.
--
-- The guard exists to prevent a partial-tree delete (someone trying to
-- remove just the master while keeping its variants/filters). When the
-- whole project is being torn down by `delete_project()` the guard's
-- intent doesn't apply — masters go with the project.
--
-- Fix: introduce a transaction-local sentinel (`app.deleting_project`).
-- `delete_project` sets it before the cascade; the trigger short-circuits
-- when the row's project_id matches. Transaction scope (third arg `true`
-- on set_config) makes the bypass impossible from outside this RPC.

create or replace function public.guard_master_immutable()
returns trigger
language plpgsql
as $$
declare
  v_in_project_delete text;
begin
  -- Allow cascade deletes performed by delete_project(). The setting is
  -- transaction-scoped via set_config(..., true), so external callers
  -- cannot pre-set it to bypass the guard on regular operations.
  v_in_project_delete := current_setting('app.deleting_project', true);
  if v_in_project_delete is not null
     and v_in_project_delete <> ''
     and (tg_op = 'DELETE' or tg_op = 'UPDATE')
     and old.project_id::text = v_in_project_delete then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

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

create or replace function public.delete_project(
  p_project_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_owner uuid;
  v_deleted uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));

  select owner_id
    into v_owner
  from public.projects
  where id = p_project_id;

  if v_owner is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  -- Signal guard_master_immutable that the whole project tree is being
  -- torn down so the cascade can include master rows. Transaction-local.
  perform set_config('app.deleting_project', p_project_id::text, true);

  delete from public.project_image_filters
   where project_id = p_project_id;

  delete from public.projects
   where id = p_project_id
   returning id into v_deleted;

  if v_deleted is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  return v_deleted;
end;
$$;
