-- gruf.io - Store file size for images
-- Adds file_size_bytes to public.project_images so UI can display "376 kb" etc.

alter table public.project_images
  add column if not exists file_size_bytes bigint not null default 0 check (file_size_bytes >= 0);

