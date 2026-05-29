-- Allow 'circulate' in project_image_trace.kind.
--
-- Pre-existing schema gap: `project_image_trace_kind_ck` whitelisted only
-- 'pixelate' and 'lineart' (the two trace kinds wired up at the time the
-- table was introduced). Circulate landed unwired (PR #299 was explicit
-- about that), got its full pipeline later, and is now reachable by
-- end-users via the bespoke dialog — but the apply path 23514's on the
-- DB upsert because the check still excludes 'circulate'.
--
-- Drop the old constraint and re-add it with all three registered trace
-- kinds. Same shape as the original, no NOT VALID — every existing row
-- already satisfies the wider whitelist by construction.

ALTER TABLE public.project_image_trace
  DROP CONSTRAINT project_image_trace_kind_ck;

ALTER TABLE public.project_image_trace
  ADD CONSTRAINT project_image_trace_kind_ck
  CHECK (kind = ANY (ARRAY['pixelate'::text, 'circulate'::text, 'lineart'::text]));
