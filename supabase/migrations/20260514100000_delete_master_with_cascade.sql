-- @intent-schema-migration
--
-- New RPC `delete_master_with_cascade(p_project_id uuid)` for full
-- master-image deletion with cascade. The UI "Delete image" button
-- (right-panel Image-Section + left-panel Image-Tab Trash) routes
-- here. Semantics: master + all derivatives (working_copy,
-- filter_working_copy, trace_output via source_image_id chain) + all
-- `project_image_filters` rows for the project + `project_image_state`
-- + `project_image_trace` are removed in one transaction, leaving the
-- project empty. The user can then upload a new master.
--
-- Why this RPC exists (two FK chains block a naive delete):
--   - `project_image_filters.input_image_id` / `output_image_id` are
--     ON DELETE RESTRICT against `project_images.id`. Without a step
--     that clears those filter rows first, a master delete (or even
--     a derivative delete with a downstream filter) hits a FK
--     constraint violation and the transaction rolls back. The
--     current UI delete-flow (master/route.ts DELETE) fails with
--     `code=23503` in exactly this scenario.
--   - `project_images.source_image_id` (self-ref) is ALSO ON DELETE
--     RESTRICT — the chain
--     `master ← working_copy ← filter_working_copy ← trace_output`
--     can't be torn down by deleting the master and relying on FK
--     cascade. (`db/schema.sql` shows CASCADE, but the actual
--     migration that created the FK uses RESTRICT — schema-drift,
--     verified against the integration-test failure.) We must
--     delete leaves before parents, in kind order.
--   - `guard_master_immutable` ([schema.sql] trigger
--     `trg_project_images_guard_master_immutable`) blocks DELETE on
--     kind='master' rows. The escape hatch is to set
--     `app.deleting_project = project_id` in the transaction; the
--     guard then waives the immutability check for that project's
--     master row.
--   - `project_image_state` and `project_image_trace` cascade
--     correctly (ON DELETE CASCADE), so they need no special
--     handling — they vanish with their parent image row.
--
-- Pattern mirror: this is the same lock + GUC + delete pattern as
-- `delete_project()` ([schema.sql:223-244]). The GUC is reused
-- intentionally: its semantic is "master-immutable contract is
-- suspended for this project in this transaction," which matches
-- both delete-project and delete-master-cascade. A separate
-- `app.deleting_master` flag would only duplicate wiring without
-- adding isolation (advisory lock + per-project guard scope already
-- prevent cross-project bleed).
--
-- Idempotency: if the project has no master (already deleted, or
-- never uploaded), the RPC returns an empty result set without
-- raising. Callers can therefore retry safely after partial
-- failures (e.g. storage-cleanup network errors).
--
-- Return value: the RPC returns the `(storage_bucket, storage_path)`
-- of every image row being deleted, BEFORE the cascade fires. The
-- API handler then calls `supabase.storage.remove()` for each, so
-- bucket objects don't orphan. Snapshot is taken via a single
-- statement with data-modifying CTEs — Postgres sees one snapshot
-- across all CTEs, so the SELECT in `collected` reads pre-delete
-- state even though `_filters` and `_master` write.
--
-- Grants: authenticated + service_role. Anon is explicitly revoked
-- (deletion is never an unauthenticated operation; RLS on `projects`
-- gates access transitively through the API route).

create or replace function public.delete_master_with_cascade(p_project_id uuid)
returns table(storage_bucket text, storage_path text)
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_master_id uuid;
  v_buckets text[];
  v_paths text[];
begin
  -- Serialise concurrent deletes on the same project so a double-
  -- click on the UI button doesn't race a second cascade through.
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));

  -- Find the project's master. If none exists (already gone, never
  -- uploaded, or kind != master), short-circuit with empty result.
  select id into v_master_id
    from public.project_images
   where project_id = p_project_id
     and kind = 'master'
     and deleted_at is null
   limit 1;
  if v_master_id is null then return; end if;

  -- Suspend `guard_master_immutable` for this transaction +
  -- project_id only. Other masters in unrelated projects stay
  -- protected (the guard checks `old.project_id::text = v_in_project_delete`).
  perform set_config('app.deleting_project', p_project_id::text, true);

  -- Snapshot storage paths BEFORE any DML so the caller can clean
  -- up bucket objects. Materialise into parallel arrays so we can
  -- `unnest` them back into the return rowset after the deletes.
  select
    coalesce(array_agg(coalesce(pi.storage_bucket, 'project_images')), '{}'),
    coalesce(array_agg(pi.storage_path), '{}')
    into v_buckets, v_paths
    from public.project_images pi
   where pi.project_id = p_project_id
     and pi.storage_path is not null;

  -- 1. Filters first (clears FK RESTRICT from project_image_filters
  --    → project_images on input_image_id + output_image_id).
  delete from public.project_image_filters
   where project_id = p_project_id;

  -- 2. Image rows in dependency order (leaves before parents,
  --    because project_images.source_image_id → project_images.id
  --    is ON DELETE RESTRICT — see header). The kind hierarchy is
  --    fixed by domain:
  --       master → working_copy → filter_working_copy → trace_output
  --    project_image_state and project_image_trace cascade via FK
  --    CASCADE on their *_image_id references — they need no
  --    explicit deletes here.
  delete from public.project_images
   where project_id = p_project_id and kind = 'trace_output';
  delete from public.project_images
   where project_id = p_project_id and kind = 'filter_working_copy';
  delete from public.project_images
   where project_id = p_project_id and kind = 'working_copy';
  delete from public.project_images
   where project_id = p_project_id and kind = 'master';

  -- Return the captured paths to the caller. Use generate_subscripts
  -- to walk both arrays by parallel index — `unnest` with multiple
  -- array args + column-definition list is not allowed in plpgsql.
  return query
    select v_buckets[i], v_paths[i]
      from generate_subscripts(v_buckets, 1) as i;
end;
$$;

alter function public.delete_master_with_cascade(uuid) owner to postgres;

grant execute on function public.delete_master_with_cascade(uuid)
  to authenticated, service_role;

revoke execute on function public.delete_master_with_cascade(uuid) from anon;
