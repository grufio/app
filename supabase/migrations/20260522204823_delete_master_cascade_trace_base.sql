-- M4 — close the `trace_base` gap in delete_master_with_cascade().
--
-- Bug: the RPC deletes project_images in the fixed kind order
--   trace_output -> filter_working_copy -> working_copy -> master
-- but never deletes `trace_base`. Under the baseline FK semantics
-- (both source_image_id and base_image_id are ON DELETE RESTRICT —
-- see 20260519130800_…:1653 and …:1633) a project that has a
-- `trace_base` row makes the cascade abort with SQLSTATE 23503 at the
-- working_copy delete: trace_base.source_image_id -> working_copy.id
-- is RESTRICT and blocks it.
--
-- Fix: add an explicit `trace_base` delete. Its POSITION is dictated
-- by BOTH RESTRICT FKs, not just one:
--   (a) project_images_source_image_id_fkey (trace_base -> working_copy,
--       RESTRICT) blocks the working_copy delete while a trace_base row
--       still exists  -> trace_base must be deleted BEFORE working_copy.
--   (b) project_image_trace_base_image_id_fkey (project_image_trace
--       -> project_images via base_image_id, RESTRICT in prod AND
--       migration) blocks the trace_base delete while a
--       project_image_trace row still points at it. That trace row is
--       removed by the ON DELETE CASCADE on project_image_trace
--       .output_image_id, which fires when trace_output is deleted in
--       step 1 -> trace_base must be deleted AFTER trace_output.
-- => trace_base sits strictly between trace_output and working_copy.
-- The same ordering dependency is documented in the app-layer trace
-- teardown (services/editor/server/trace/index.ts:487-492,
-- services/editor/server/trace/pixelate.ts:374-375).
--
-- The storage-path snapshot (array_agg over all project_images with a
-- non-null storage_path) is NOT kind-filtered, so trace_base paths are
-- already included in the returned rowset — no change needed there.
--
-- Idempotent / safe by construction: CREATE OR REPLACE, no schema
-- change, no destructive op beyond the already-cascading delete. Three
-- callers benefit automatically: the cascade route, the project-delete
-- path, and cleanupExistingMasters() on master re-upload
-- (services/editor/server/master-image-upload/cleanup.ts:74).

CREATE OR REPLACE FUNCTION "public"."delete_master_with_cascade"("p_project_id" "uuid") RETURNS TABLE("storage_bucket" "text", "storage_path" "text")
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
  -- Not kind-filtered, so trace_base paths are captured too.
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
  --       master → working_copy → {filter_working_copy, trace_base, trace_output}
  --    project_image_state and project_image_trace cascade via FK
  --    CASCADE on their *_image_id references — they need no
  --    explicit deletes here.
  --
  --    trace_output goes first so the project_image_trace row (whose
  --    output_image_id FK is ON DELETE CASCADE) disappears, releasing
  --    the project_image_trace.base_image_id RESTRICT FK that would
  --    otherwise block the trace_base delete (23503). trace_base then
  --    goes before working_copy because trace_base.source_image_id →
  --    working_copy is ON DELETE RESTRICT.
  delete from public.project_images
   where project_id = p_project_id and kind = 'trace_output';
  delete from public.project_images
   where project_id = p_project_id and kind = 'trace_base';
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
