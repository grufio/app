-- gruf.io - Runtime index for master image list endpoint
--
-- Optimizes:
-- - GET /api/projects/:projectId/images/master/list
--   filters: project_id, role='master', deleted_at is null
--   order: created_at desc

create index if not exists project_images_master_list_active_idx
  on public.project_images (project_id, created_at desc)
  where role = 'master' and deleted_at is null;
