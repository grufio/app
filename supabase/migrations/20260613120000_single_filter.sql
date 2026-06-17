-- Single-Artifact editor model: exactly ONE filter per project.
--
-- Replaces the stacked-filter model (project_image_filters.stack_order + chain
-- append/remove-with-rewire) with a hard single-slot invariant: UNIQUE(project_id).
-- The app now applies filters as REPLACE (delete-then-insert) and the cascade
-- (filter→trace) is enforced server-side; see services/editor/server/filter-variants.ts.
--
-- PRE-CHECK (read-only on prod, single-user → expected 0): projects with >1 filter
--   SELECT project_id, count(*) FROM project_image_filters GROUP BY 1 HAVING count(*) > 1;
-- Runs in one transaction (Supabase default) so a partial failure can't leave the
-- UNIQUE constraint added without the collapse.

-- 1) Collapse any project with >1 filter to its stack_order=1 root (no-op when 0).
--    Delete the non-root filter ROWS and, in the same statement, ONLY their own
--    output images (a data-modifying CTE). Scoping to exactly the deleted chain's
--    outputs is critical: NOT every filter_working_copy is a filter output — crop
--    also produces kind='filter_working_copy', and a blanket delete would wrongly
--    remove crop results (and trip project_images_source_image_id_fkey).
WITH del_rows AS (
  DELETE FROM "public"."project_image_filters"
   WHERE "stack_order" > 1
  RETURNING "output_image_id"
)
DELETE FROM "public"."project_images"
 WHERE "id" IN (SELECT "output_image_id" FROM del_rows)
   AND "kind" = 'filter_working_copy';

UPDATE "public"."project_images" p
   SET "is_active" = true
  FROM "public"."project_image_filters" f
 WHERE f."output_image_id" = p."id"
   AND p."project_id" = f."project_id"
   AND p."deleted_at" IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM "public"."project_images" a
      WHERE a."project_id" = p."project_id" AND a."is_active" = true AND a."deleted_at" IS NULL
   );

-- 2) Enforce single filter; drop the stack_order ordering objects.
ALTER TABLE "public"."project_image_filters"
  DROP CONSTRAINT IF EXISTS "project_image_filters_project_stack_order_uidx";
DROP INDEX IF EXISTS "public"."project_image_filters_project_order_idx";
ALTER TABLE "public"."project_image_filters"
  ADD CONSTRAINT "project_image_filters_project_id_key" UNIQUE ("project_id");
ALTER TABLE "public"."project_image_filters"
  DROP COLUMN "stack_order";  -- auto-drops project_image_filters_stack_order_check

-- 3) Single-slot RPCs (signatures + advisory lock + membership checks kept).
--    append: plain INSERT — a second filter for the same project now hits the
--    UNIQUE(project_id) constraint (23505), the intended "already exists" signal.
CREATE OR REPLACE FUNCTION "public"."append_project_image_filter"(
  "p_project_id" "uuid", "p_input_image_id" "uuid", "p_output_image_id" "uuid",
  "p_filter_type" "text", "p_filter_params" "jsonb" DEFAULT '{}'::"jsonb"
) RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_inserted_id uuid;
  v_input_project_id uuid;
  v_output_project_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));

  select project_id into v_input_project_id
    from public.project_images where id = p_input_image_id and deleted_at is null;
  if v_input_project_id is distinct from p_project_id then
    raise exception 'input_image_id is not part of project' using errcode = '23503';
  end if;

  select project_id into v_output_project_id
    from public.project_images where id = p_output_image_id and deleted_at is null;
  if v_output_project_id is distinct from p_project_id then
    raise exception 'output_image_id is not part of project' using errcode = '23503';
  end if;

  insert into public.project_image_filters (
    project_id, input_image_id, output_image_id, filter_type, filter_params
  ) values (
    p_project_id, p_input_image_id, p_output_image_id, p_filter_type,
    coalesce(p_filter_params, '{}'::jsonb)
  )
  returning id into v_inserted_id;

  return v_inserted_id;
end;
$$;

--    remove: simple delete. p_rewires kept in the signature for compatibility but
--    ignored (single filter → nothing downstream to rewire/renumber).
CREATE OR REPLACE FUNCTION "public"."remove_project_image_filter"(
  "p_project_id" "uuid", "p_filter_id" "uuid", "p_rewires" "jsonb" DEFAULT '[]'::"jsonb"
) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_target_project uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));

  select project_id into v_target_project
    from public.project_image_filters where id = p_filter_id;

  if v_target_project is null then
    raise exception 'filter not found' using errcode = 'P0002';
  end if;
  if v_target_project is distinct from p_project_id then
    raise exception 'filter does not belong to project' using errcode = '23503';
  end if;

  delete from public.project_image_filters
   where id = p_filter_id and project_id = p_project_id;
end;
$$;
