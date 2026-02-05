-- gruf.io - Support multiple images per project
-- Adds role expansion, active master, storage metadata, indexes, and optional soft delete.

-- Extend image_role enum (do not remove existing values)
do $$ begin
  alter type public.image_role add value 'asset';
exception when duplicate_object then null; end $$;

-- Allow multiple images per role
alter table public.project_images
  drop constraint if exists project_images_one_per_role;

-- Storage metadata
alter table public.project_images
  add column if not exists storage_bucket text not null default 'project_images';

-- Active master flag
alter table public.project_images
  add column if not exists is_active boolean not null default false;

-- Optional soft delete
alter table public.project_images
  add column if not exists deleted_at timestamptz;

-- Backfill active master (latest master per project)
with ranked as (
  select
    id,
    project_id,
    row_number() over (partition by project_id order by created_at desc) as rn
  from public.project_images
  where role = 'master' and deleted_at is null
)
update public.project_images pi
set is_active = (ranked.rn = 1)
from ranked
where pi.id = ranked.id;

-- Indexes
create index if not exists project_images_project_id_role_created_at_idx
  on public.project_images (project_id, role, created_at desc);

-- Enforce one active master per project
create unique index if not exists project_images_one_active_master_idx
  on public.project_images (project_id)
  where role = 'master' and is_active is true and deleted_at is null;

-- Helpers to atomically switch active master
create or replace function public.set_active_master_image(p_project_id uuid, p_image_id uuid)
returns void
language plpgsql
as $$
begin
  update public.project_images
  set is_active = false
  where project_id = p_project_id
    and role = 'master'
    and deleted_at is null;

  update public.project_images
  set is_active = true
  where id = p_image_id
    and project_id = p_project_id
    and role = 'master'
    and deleted_at is null;
end;
$$;

create or replace function public.set_active_master_latest(p_project_id uuid)
returns void
language plpgsql
as $$
declare
  v_image_id uuid;
begin
  select id
  into v_image_id
  from public.project_images
  where project_id = p_project_id
    and role = 'master'
    and deleted_at is null
  order by created_at desc
  limit 1;

  if v_image_id is not null then
    perform public.set_active_master_image(p_project_id, v_image_id);
  end if;
end;
$$;
