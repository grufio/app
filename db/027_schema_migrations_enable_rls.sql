-- gruf.io - Enable RLS on schema_migrations table
alter table if exists public.schema_migrations enable row level security;
