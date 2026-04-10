-- typed-kinds: project_images.kind + deterministic backfill + active constraints
do $$ begin
  create type public.image_kind as enum ('master', 'working_copy', 'filter_working_copy');
exception when duplicate_object then null; end $$;

alter table public.project_images
  add column if not exists kind public.image_kind;

update public.project_images
set kind = case
  when role = 'master' then 'master'::public.image_kind
  when role = 'asset' and (source_image_id is not null or lower(name) like '%(filter working)%') then 'filter_working_copy'::public.image_kind
  else 'working_copy'::public.image_kind
end
where kind is null;

alter table public.project_images
  alter column kind set not null;

create unique index if not exists project_images_active_master_kind_uidx
  on public.project_images(project_id)
  where is_active is true and deleted_at is null and kind = 'master';

create unique index if not exists project_images_active_working_copy_kind_uidx
  on public.project_images(project_id)
  where is_active is true and deleted_at is null and kind = 'working_copy';
