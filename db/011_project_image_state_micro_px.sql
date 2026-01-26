-- gruf.io - Persist image state size/position in µpx (string BigInt)

alter table public.project_image_state
  add column if not exists width_px_u text,
  add column if not exists height_px_u text,
  add column if not exists x_px_u text,
  add column if not exists y_px_u text;
