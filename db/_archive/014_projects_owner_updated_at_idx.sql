-- gruf.io - Optimize dashboard project list ordering
--
-- Common query pattern:
--   select ... from projects where owner_id = auth.uid() order by updated_at desc
--
-- Add a composite index to support this efficiently.

create index if not exists projects_owner_updated_at_idx
on public.projects (owner_id, updated_at desc);

