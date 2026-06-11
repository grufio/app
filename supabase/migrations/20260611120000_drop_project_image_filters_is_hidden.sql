-- Drop project_image_filters.is_hidden — the per-filter show/hide feature
-- is removed.
--
-- `is_hidden` was a pure UI flag: the server always composed the full filter
-- chain regardless of its value (services/editor/server/filter-working-copy,
-- filter-variants), so it never affected rendered output — only whether a
-- filter row was greyed out in the (now-removed) mobile filter sheet. With the
-- filter section driven entirely by the top-left "+" menu (apply kind / remove
-- / unlock), there is no UI surface for per-filter visibility, so the column is
-- dead. The PATCH route that wrote it and every reader were removed in the same
-- change.
--
-- DROP COLUMN takes ACCESS EXCLUSIVE but is metadata-only (no table rewrite)
-- and instant on a table this size. IF EXISTS keeps the migration idempotent.
ALTER TABLE public.project_image_filters
  DROP COLUMN IF EXISTS "is_hidden";
