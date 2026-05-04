-- One-time cleanup of orphaned filter chains.
--
-- Removes project_image_filters rows whose input_image_id no longer references
-- a live project_images row, and soft-deletes filter_working_copy outputs that
-- no filter row points to anymore. Idempotent.

delete from project_image_filters f
where not exists (
  select 1
  from project_images i
  where i.id = f.input_image_id
    and i.deleted_at is null
);

update project_images
set deleted_at = now()
where kind = 'filter_working_copy'
  and role = 'asset'
  and deleted_at is null
  and is_active = false
  and id not in (select output_image_id from project_image_filters);
