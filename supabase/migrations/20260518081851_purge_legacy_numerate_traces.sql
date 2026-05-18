-- Purge legacy numerate trace outputs (post PR #182).
--
-- PR #182 replaced the numerate render pipeline. SVGs in storage
-- from the old vtracer-based pipeline show diagonal polygons and
-- missing cells. We don't keep them around for backward-compat —
-- the editor will simply show "no trace" for affected projects
-- and the user re-applies to get a fresh, correct output.
--
-- Scope is strictly numerate. Lineart trace bindings stay.
-- Storage objects are not deleted by this migration; they become
-- orphaned but are no longer referenced from RLS-visible rows.

DO $$
DECLARE
  trace_output_ids uuid[];
  orphan_count int;
BEGIN
  -- 1. Capture which images we're about to retire (numerate-only).
  SELECT array_agg(output_image_id) INTO trace_output_ids
  FROM project_image_trace
  WHERE kind = 'numerate';

  IF trace_output_ids IS NULL THEN
    RAISE NOTICE 'No legacy numerate traces to purge.';
    RETURN;
  END IF;

  -- 2. Safety guard: refuse to run if any project_image_state row
  -- points at a doomed trace_output and has NO active master to
  -- fall back to. Without a fallback we'd violate the NOT-NULL
  -- constraint on image_id.
  SELECT count(*) INTO orphan_count
  FROM project_image_state s
  WHERE s.image_id = ANY(trace_output_ids)
    AND NOT EXISTS (
      SELECT 1 FROM project_images m
      WHERE m.project_id = s.project_id
        AND m.kind = 'master'
        AND m.is_active = true
        AND m.deleted_at IS NULL
    );
  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'Aborting: % project(s) point at a numerate trace_output but have no active master to fall back to. Fix data inconsistency before re-running this migration.',
      orphan_count;
  END IF;

  -- 3. Drop the numerate trace bindings. Lineart bindings stay.
  DELETE FROM project_image_trace WHERE kind = 'numerate';

  -- 4. Fall back any project_image_state still pointing at a
  -- doomed trace_output to the project's active master.
  UPDATE project_image_state s
  SET image_id = (
    SELECT id FROM project_images m
    WHERE m.project_id = s.project_id
      AND m.kind = 'master'
      AND m.is_active = true
      AND m.deleted_at IS NULL
    LIMIT 1
  )
  WHERE s.image_id = ANY(trace_output_ids);

  -- 5. Clear the is_active flag on the doomed rows so they don't
  -- linger as phantom-active entries alongside their soft-delete.
  UPDATE project_images
  SET is_active = false
  WHERE id = ANY(trace_output_ids)
    AND is_active = true;

  -- 6. Soft-delete the trace_output image rows themselves
  -- (tombstone semantics matching the app's tombstoneTraceOutput).
  UPDATE project_images
  SET deleted_at = now()
  WHERE id = ANY(trace_output_ids)
    AND deleted_at IS NULL;

  RAISE NOTICE 'Purged % legacy numerate traces.', array_length(trace_output_ids, 1);
END $$;
