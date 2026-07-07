-- Allow 'linerate' in project_image_trace.kind (new segmentation-based trace).
--
-- linerate is a new trace model (sibling to lineart) registered in
-- TRACE_REGISTRY. Two per-kind CHECK constraints hardcode the allowed set and
-- must be widened, or the apply-path DB upsert fails:
--   1. project_image_trace_kind_ck whitelists the kinds → add 'linerate'.
--   2. project_image_trace_base_image_required_ck exempts only 'lineart' from
--      requiring a base_image_id; linerate likewise has no crop / base image
--      (its handler returns no baseId), so exempt it too.
--
-- Both changes only WIDEN the constraints (superset), so every existing row
-- already satisfies them — plain drop / re-add, no NOT VALID needed (same
-- shape as 20260529192932_trace_kind_allow_circulate.sql).

ALTER TABLE public.project_image_trace
  DROP CONSTRAINT project_image_trace_kind_ck;

ALTER TABLE public.project_image_trace
  ADD CONSTRAINT project_image_trace_kind_ck
  CHECK (kind = ANY (ARRAY['pixelate'::text, 'circulate'::text, 'lineart'::text, 'linerate'::text]));

ALTER TABLE public.project_image_trace
  DROP CONSTRAINT project_image_trace_base_image_required_ck;

ALTER TABLE public.project_image_trace
  ADD CONSTRAINT project_image_trace_base_image_required_ck
  CHECK (kind = ANY (ARRAY['lineart'::text, 'linerate'::text]) OR base_image_id IS NOT NULL);
