-- Remove 'lineart' from project_image_trace.kind (lineart trace removed).
--
-- The lineart trace kind has been removed from the app entirely (TRACE_REGISTRY,
-- schema, filter-service endpoint, forms, tests). Two per-kind CHECK constraints
-- still whitelist it; NARROW them so the value is no longer accepted:
--   1. project_image_trace_kind_ck → drop 'lineart' from the allowed set.
--   2. project_image_trace_base_image_required_ck → only 'linerate' stays exempt
--      from requiring a base_image_id (linerate has no crop / base image).
--
-- Unlike the widening migrations (…_allow_circulate / …_allow_linerate) this
-- NARROWS the constraints. lineart was never persisted (0 rows in prod); the
-- defensive DELETE below removes any stray lineart trace row first so the re-added
-- CHECK always validates. Deleting a trace row leaves its output project_images
-- rows intact (auditable orphan) — the correct end state for a removed kind.

DELETE FROM public.project_image_trace WHERE kind = 'lineart';

ALTER TABLE public.project_image_trace
  DROP CONSTRAINT project_image_trace_kind_ck;

ALTER TABLE public.project_image_trace
  ADD CONSTRAINT project_image_trace_kind_ck
  CHECK (kind = ANY (ARRAY['pixelate'::text, 'circulate'::text, 'linerate'::text]));

ALTER TABLE public.project_image_trace
  DROP CONSTRAINT project_image_trace_base_image_required_ck;

ALTER TABLE public.project_image_trace
  ADD CONSTRAINT project_image_trace_base_image_required_ck
  CHECK (kind = ANY (ARRAY['linerate'::text]) OR base_image_id IS NOT NULL);
