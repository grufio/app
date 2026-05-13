-- @intent-data-migration
--
-- Purge legacy `project_image_state` rows that were written at non-
-- master image ids (filter_working_copy, trace_output, crop outputs)
-- before PR-2 (split image activation from state-seed).
--
-- These rows are "junk":
--   - The editor reads state by resolving the project's master.id
--     and querying `(project_id, master.id)` (PR #124, GET handler).
--   - They never affect the rendered transform.
--   - They accumulate one new row per filter/trace/crop apply, forever.
--
-- After PR-2 is deployed no new junk rows can be written. After PR-4
-- (RPC kind=master guard) the RPC itself rejects non-master ids. This
-- migration removes the accumulated backlog. Promised in #124 PR-2.
--
-- Strict ordering on prod (see plan):
--   1. PR-2 code deploy (already live: stops the source)
--   2. PR-3 db push (axis-pair + soft-delete trigger)
--   3. PR-4 db push (RPC kind-check; defence-in-depth)
--   4. PR-5 db push ← THIS MIGRATION
--
-- The DELETE is keyed by a NOT IN against the "live master" set, so
-- it's safe to re-run: a second apply removes nothing.

DELETE FROM public.project_image_state
WHERE image_id NOT IN (
  SELECT id FROM public.project_images
  WHERE kind = 'master' AND deleted_at IS NULL
);
