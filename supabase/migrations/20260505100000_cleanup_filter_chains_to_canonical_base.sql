-- Cleanup: enforce that every project_image_filters chain starts from a "(filter working)"
-- base derived from the project's working_copy.
--
-- After the architectural fix where getOrCreateFilterWorkingCopy resolves the chain base
-- from `working_copy` (not the chain tip), pre-existing chains whose first row has
-- input_image_id != current canonical base become invalid. Those would be auto-healed at
-- read time, but pruning them ahead of time avoids warning logs and stale storage rows.
--
-- Idempotent.

-- Step 1: identify projects whose filter chain does NOT start from a canonical base
-- (a filter_working_copy whose source is a non-deleted working_copy and whose name ends
-- with "(filter working)").
with canonical_bases as (
  select fwc.id as base_id, fwc.project_id
  from project_images fwc
  join project_images wc
    on wc.id = fwc.source_image_id
   and wc.kind = 'working_copy'
   and wc.deleted_at is null
  where fwc.kind = 'filter_working_copy'
    and fwc.role = 'asset'
    and fwc.deleted_at is null
    and fwc.name like '%(filter working)'
),
first_links as (
  select distinct on (project_id) project_id, input_image_id
  from project_image_filters
  order by project_id, stack_order asc
),
invalid_projects as (
  select fl.project_id
  from first_links fl
  left join canonical_bases cb
    on cb.project_id = fl.project_id
   and cb.base_id = fl.input_image_id
  where cb.base_id is null
)
delete from project_image_filters
where project_id in (select project_id from invalid_projects);

-- Step 2: also drop rows whose input or output references a deleted/missing image
-- (covers projects that escaped step 1 but still have orphan rows).
delete from project_image_filters f
where not exists (
  select 1 from project_images i
  where i.id = f.input_image_id and i.deleted_at is null
)
or not exists (
  select 1 from project_images i
  where i.id = f.output_image_id and i.deleted_at is null
);

-- Step 3: soft-delete filter_working_copy outputs no longer referenced by any filter row
-- (and not currently active).
update project_images
set deleted_at = now()
where kind = 'filter_working_copy'
  and role = 'asset'
  and deleted_at is null
  and is_active = false
  and name not like '%(filter working)'
  and id not in (select output_image_id from project_image_filters);
