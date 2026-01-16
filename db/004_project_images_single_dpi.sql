-- gruf.io - Fix DPI model for images
-- DPI is a single value for the whole image (not per width/height).
-- Also: DPI and bit depth are not required at upload time.

-- 1) Add single dpi column (nullable)
alter table public.project_images
  add column if not exists dpi numeric;

-- 2) Backfill from old dpi_x/dpi_y if present (prefer dpi_x)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_images'
      and column_name = 'dpi_x'
  ) then
    execute 'update public.project_images set dpi = dpi_x where dpi is null';
  end if;
end $$;

-- 3) Make bit_depth nullable (upload does not require it)
alter table public.project_images
  alter column bit_depth drop not null;

-- 4) Drop old per-axis dpi columns if they exist
alter table public.project_images
  drop column if exists dpi_x,
  drop column if exists dpi_y;

