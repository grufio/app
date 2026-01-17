-- gruf.io - Persist editor "working copy" image transform (position/scale/rotation)
--
-- Stores the current image transform for a given project + image role.
-- This allows the editor to restore the image state across page reloads.

create table if not exists public.project_image_state (
  project_id uuid not null references public.projects(id) on delete cascade,
  role public.image_role not null,

  -- image transform in artboard/world coordinates
  x numeric not null default 0,
  y numeric not null default 0,
  scale_x numeric not null default 1 check (scale_x > 0),
  scale_y numeric not null default 1 check (scale_y > 0),
  rotation_deg integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint project_image_state_pk primary key (project_id, role)
);

drop trigger if exists trg_project_image_state_updated_at on public.project_image_state;
create trigger trg_project_image_state_updated_at
before update on public.project_image_state
for each row execute function public.set_updated_at();

alter table public.project_image_state enable row level security;

drop policy if exists project_image_state_owner_all on public.project_image_state;
create policy project_image_state_owner_all
on public.project_image_state for all
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  )
);

