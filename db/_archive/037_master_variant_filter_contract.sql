-- gruf.io - Master / Variant / Filter contract hardening
--
-- Contract:
-- - Exactly one immutable master image per project.
-- - Every derived copy is a new row in project_images.
-- - Filters are modeled as an ordered stack (1..n), each step produces a new variant row.

-- -------------------------------------------------------------------
-- project_images: enforce one immutable master + variant lineage shape
-- -------------------------------------------------------------------

create unique index if not exists project_images_one_master_per_project_idx
  on public.project_images (project_id)
  where role = 'master' and deleted_at is null;

alter table public.project_images
  drop constraint if exists project_images_master_no_source_ck;

alter table public.project_images
  add constraint project_images_master_no_source_ck
  check (role <> 'master' or source_image_id is null);

alter table public.project_images
  drop constraint if exists project_images_asset_requires_source_ck;

alter table public.project_images
  add constraint project_images_asset_requires_source_ck
  check (role <> 'asset' or source_image_id is not null) not valid;

create or replace function public.guard_master_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.role = 'master' then
    raise exception using
      message = 'master image is immutable',
      detail = format('project_id=%s image_id=%s', old.project_id, old.id),
      hint = 'Use restore/activation flow instead of deleting the master image.';
  end if;

  if tg_op = 'UPDATE' and old.role = 'master' then
    -- Master content metadata must remain immutable.
    if new.name is distinct from old.name
       or new.format is distinct from old.format
       or new.width_px is distinct from old.width_px
       or new.height_px is distinct from old.height_px
       or new.storage_bucket is distinct from old.storage_bucket
       or new.storage_path is distinct from old.storage_path
       or new.file_size_bytes is distinct from old.file_size_bytes
       or new.source_image_id is distinct from old.source_image_id
       or new.crop_rect_px is distinct from old.crop_rect_px
       or new.role is distinct from old.role
       or new.deleted_at is distinct from old.deleted_at then
      raise exception using
        message = 'master image is immutable',
        detail = format('project_id=%s image_id=%s', old.project_id, old.id),
        hint = 'Only active pointer changes are allowed for master image rows.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

alter function public.guard_master_immutable()
  set search_path = public, pg_temp;

drop trigger if exists trg_project_images_guard_master_immutable on public.project_images;
create trigger trg_project_images_guard_master_immutable
before update or delete on public.project_images
for each row execute function public.guard_master_immutable();

-- -------------------------------------------------------------------
-- RLS: keep owner-only access and deny direct master delete
-- -------------------------------------------------------------------

drop policy if exists project_images_owner_all on public.project_images;
drop policy if exists project_images_owner_select on public.project_images;
drop policy if exists project_images_owner_insert on public.project_images;
drop policy if exists project_images_owner_update on public.project_images;
drop policy if exists project_images_owner_delete_non_master on public.project_images;

create policy project_images_owner_select
on public.project_images for select
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

create policy project_images_owner_insert
on public.project_images for insert
with check (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

create policy project_images_owner_update
on public.project_images for update
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
)
with check (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

create policy project_images_owner_delete_non_master
on public.project_images for delete
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
  and role <> 'master'
);

-- -------------------------------------------------------------------
-- Filter stack table: each step references input and output image rows
-- -------------------------------------------------------------------

create table if not exists public.project_image_filters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  input_image_id uuid not null references public.project_images(id) on delete restrict,
  output_image_id uuid not null references public.project_images(id) on delete restrict,
  filter_type text not null,
  filter_params jsonb not null default '{}'::jsonb,
  stack_order integer not null check (stack_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_image_filters_project_stack_order_uidx unique (project_id, stack_order),
  constraint project_image_filters_output_unique unique (output_image_id),
  constraint project_image_filters_input_not_output_ck check (input_image_id <> output_image_id)
);

create index if not exists project_image_filters_project_order_idx
  on public.project_image_filters (project_id, stack_order);

create index if not exists project_image_filters_input_image_idx
  on public.project_image_filters (input_image_id);

create index if not exists project_image_filters_output_image_idx
  on public.project_image_filters (output_image_id);

drop trigger if exists trg_project_image_filters_updated_at on public.project_image_filters;
create trigger trg_project_image_filters_updated_at
before update on public.project_image_filters
for each row execute function public.set_updated_at();

alter table public.project_image_filters enable row level security;

drop policy if exists project_image_filters_owner_all on public.project_image_filters;
drop policy if exists project_image_filters_owner_select on public.project_image_filters;
drop policy if exists project_image_filters_owner_insert on public.project_image_filters;
drop policy if exists project_image_filters_owner_update on public.project_image_filters;
drop policy if exists project_image_filters_owner_delete on public.project_image_filters;

create policy project_image_filters_owner_select
on public.project_image_filters for select
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

create policy project_image_filters_owner_insert
on public.project_image_filters for insert
with check (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

create policy project_image_filters_owner_update
on public.project_image_filters for update
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
)
with check (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

create policy project_image_filters_owner_delete
on public.project_image_filters for delete
using (
  project_id in (select id from public.projects where owner_id = auth.uid())
);

