-- Fix: project deletion blocked by RESTRICT FKs.
--
-- `project_image_filters.input_image_id` and `output_image_id` reference
-- `project_images` with ON DELETE RESTRICT (intentional — prevents
-- accidentally orphaning a filter chain). When you delete a project,
-- Postgres cascade-deletes `project_images` via the project FK; the
-- RESTRICT check on filter rows fires *immediately* (not deferred), so
-- the cascade aborts with 23503 even though filters are also slated to
-- cascade-delete via their own project FK. Postgres does not coalesce
-- those into a single transitive plan.
--
-- Same shape on `project_images.source_image_id` (self-FK with RESTRICT
-- guarding master → variant), but that one is single-statement-safe
-- because Postgres re-evaluates self-referencing RESTRICT after all rows
-- in the same DELETE are processed.
--
-- Fix: atomic RPC that deletes filters first, then the project (cascade
-- handles the remaining children). Single advisory lock per project to
-- match the existing filter-mutation locking convention.

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

  -- Owner check is enforced by RLS on the final delete statement, but
  -- we look up the owner_id for an explicit P0002 / not-found path.
  select owner_id
    into v_owner
  from public.projects
  where id = p_project_id;

  if v_owner is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  delete from public.project_image_filters
   where project_id = p_project_id;

  delete from public.projects
   where id = p_project_id
   returning id into v_deleted;

  if v_deleted is null then
    -- RLS hid the row from the auth user (owner mismatch) — surface as
    -- a not-found rather than silently no-op.
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  return v_deleted;
end;
$$;
