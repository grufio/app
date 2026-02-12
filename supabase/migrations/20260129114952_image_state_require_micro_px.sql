-- Enforce canonical µpx sizing on persisted image state.
--
-- Goal: prevent unsupported states where `width_px_u` / `height_px_u` are missing.
-- Backfill from legacy numeric columns when possible.

-- 1) Backfill µpx columns from legacy px numeric columns (best-effort).
--    We store µpx as string-encoded bigint.
update public.project_image_state
set
  width_px_u = coalesce(width_px_u, (round(width_px * 1000000))::bigint::text),
  height_px_u = coalesce(height_px_u, (round(height_px * 1000000))::bigint::text),
  x_px_u = coalesce(x_px_u, (round(x * 1000000))::bigint::text),
  y_px_u = coalesce(y_px_u, (round(y * 1000000))::bigint::text)
where
  (width_px_u is null and width_px is not null)
  or (height_px_u is null and height_px is not null)
  or (x_px_u is null and x is not null)
  or (y_px_u is null and y is not null);

-- 2) Enforce NOT NULL for canonical µpx size.
alter table public.project_image_state
  alter column width_px_u set not null,
  alter column height_px_u set not null;

