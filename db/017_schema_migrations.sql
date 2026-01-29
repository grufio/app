-- gruf.io - Track applied SQL migrations (optional)
--
-- Supabase SQL editor runs are not automatically tracked for custom migrations.
-- This table provides a lightweight, auditable record of what was applied.

create table if not exists public.schema_migrations (
  id bigserial primary key,
  filename text not null,
  checksum_sha256 text not null,
  applied_at timestamptz not null default now(),
  constraint schema_migrations_filename_unique unique (filename)
);

