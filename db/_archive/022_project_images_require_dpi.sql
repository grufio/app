-- gruf.io - enforce strict actual DPI for project images
-- Block migration when legacy rows still violate the strict contract.
do $$
declare
  invalid_count bigint;
begin
  select count(*)
    into invalid_count
  from public.project_images
  where dpi is null or dpi <= 0;

  if invalid_count > 0 then
    raise exception using
      message = format(
        'blocked: %s rows in public.project_images have invalid dpi (dpi is null or <= 0)',
        invalid_count
      ),
      hint = 'Run preflight remediation before applying db/022_project_images_require_dpi.sql.';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'project_images_dpi_gt_zero'
      and conrelid = 'public.project_images'::regclass
  ) then
    alter table public.project_images
      add constraint project_images_dpi_gt_zero
      check (dpi > 0);
  end if;
end $$;

alter table public.project_images
  alter column dpi set not null;
