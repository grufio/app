-- Re-anchor project_image_state from master.id to working_copy.id.
--
-- Per User-Modell: der Master (= uploaded original) ist nach Insert
-- immutabel. Alle Display-State-Mutationen (Resize, Drag, Pixelate-
-- Apply) gehören zur Working-Copy. Master + Working-Copy werden
-- eager beim Upload angelegt (siehe master-image-upload.ts in
-- diesem PR).
--
-- Vier Schritte, alle idempotent:
-- 1. Neue RPC `set_active_image_with_state` ohne Master-Kind-Guard.
-- 2. Working-Copy-Rows für bestehende Master-Rows ohne working_copy
--    backfillen. storage_path wird mit Master geteilt (= same file,
--    no extra storage).
-- 3. project_image_state rows von master.id auf working_copy.id
--    umziehen (Insert with ON CONFLICT, dann delete der alten).
-- 4. is_active flip: working_copy übernimmt, master wird inaktiv.
--
-- Konzeptionell nimmt das die PR-#124-Anchor-Entscheidung zurück.
-- Code-Updates in derselben Wave (master-upload, restore-route,
-- image-state-route, lib/supabase/image-state).
--
-- Alte RPC `set_active_master_with_state` wird am Ende gedropped —
-- kein Caller mehr nach dem Code-Update.

-- Step 1: new RPC without master-kind guard
CREATE OR REPLACE FUNCTION public.set_active_image_with_state(
  p_project_id uuid,
  p_image_id uuid,
  p_x_px_u text,
  p_y_px_u text,
  p_width_px_u text,
  p_height_px_u text
) RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
declare
  v_x_u bigint;
  v_y_u bigint;
  v_w_u bigint;
  v_h_u bigint;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));

  if not exists (
    select 1 from public.project_images
    where id = p_image_id
      and project_id = p_project_id
      and deleted_at is null
  ) then
    raise exception 'image_id must be a live project_image'
      using errcode = '23514',
            detail = format('project_id=%s image_id=%s', p_project_id, p_image_id);
  end if;

  v_x_u := p_x_px_u::bigint;
  v_y_u := p_y_px_u::bigint;
  v_w_u := p_width_px_u::bigint;
  v_h_u := p_height_px_u::bigint;

  if v_w_u <= 0 or v_h_u <= 0 then
    raise exception 'initial placement size must be positive';
  end if;

  perform public.set_active_image(p_project_id, p_image_id);

  insert into public.project_image_state (
    project_id, image_id, x_px_u, y_px_u, width_px_u, height_px_u, rotation_deg
  ) values (
    p_project_id, p_image_id, v_x_u::text, v_y_u::text, v_w_u::text, v_h_u::text, 0
  )
  on conflict (project_id, image_id)
  do update set
    x_px_u = excluded.x_px_u,
    y_px_u = excluded.y_px_u,
    width_px_u = excluded.width_px_u,
    height_px_u = excluded.height_px_u,
    rotation_deg = excluded.rotation_deg,
    updated_at = now();
end;
$$;

ALTER FUNCTION public.set_active_image_with_state(uuid, uuid, text, text, text, text) OWNER TO postgres;
GRANT ALL ON FUNCTION public.set_active_image_with_state(uuid, uuid, text, text, text, text) TO anon;
GRANT ALL ON FUNCTION public.set_active_image_with_state(uuid, uuid, text, text, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.set_active_image_with_state(uuid, uuid, text, text, text, text) TO service_role;

-- Step 2: backfill working_copy for masters without one. Share storage_path
-- with master (= no file copy, identical bytes); copy-on-write can be added
-- later if any code path actually needs to mutate the working_copy bitmap
-- (currently nothing does — filters create fresh filter_working_copy rows
-- with their own files; pixelate is non-destructive in PR B).
INSERT INTO public.project_images (
  id, project_id, kind, source_image_id, name, format,
  width_px, height_px, dpi, storage_bucket, storage_path,
  file_size_bytes, is_active, is_locked, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  m.project_id,
  'working_copy',
  m.id,
  COALESCE(m.name, 'image') || ' (working copy)',
  m.format,
  m.width_px,
  m.height_px,
  m.dpi,
  m.storage_bucket,
  m.storage_path,
  m.file_size_bytes,
  false,  -- is_active flipped in step 4 below
  false,
  now(),
  now()
FROM public.project_images m
WHERE m.kind = 'master'
  AND m.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.project_images w
    WHERE w.project_id = m.project_id
      AND w.kind = 'working_copy'
      AND w.deleted_at IS NULL
  );

-- Step 3: copy state rows from master.id to working_copy.id, then delete
-- the master-anchored originals. Per-project advisory lock not needed here
-- — migrations run single-threaded.
WITH master_state_with_wc AS (
  SELECT
    s.project_id,
    w.id AS working_copy_id,
    s.x_px_u,
    s.y_px_u,
    s.width_px_u,
    s.height_px_u,
    s.rotation_deg,
    s.created_at
  FROM public.project_image_state s
  JOIN public.project_images m
    ON m.id = s.image_id
    AND m.kind = 'master'
    AND m.deleted_at IS NULL
  JOIN public.project_images w
    ON w.project_id = s.project_id
    AND w.kind = 'working_copy'
    AND w.deleted_at IS NULL
)
INSERT INTO public.project_image_state (
  project_id, image_id, x_px_u, y_px_u, width_px_u, height_px_u, rotation_deg, created_at, updated_at
)
SELECT
  project_id, working_copy_id, x_px_u, y_px_u, width_px_u, height_px_u, rotation_deg, created_at, now()
FROM master_state_with_wc
ON CONFLICT (project_id, image_id) DO NOTHING;

DELETE FROM public.project_image_state s
USING public.project_images m, public.project_images w
WHERE s.image_id = m.id
  AND m.kind = 'master'
  AND m.deleted_at IS NULL
  AND w.project_id = s.project_id
  AND w.kind = 'working_copy'
  AND w.deleted_at IS NULL;

-- Step 4: flip is_active. Working_copy becomes the editor-active surface;
-- master never is_active. Only flip projects where a working_copy exists.
UPDATE public.project_images m
SET is_active = false
WHERE m.kind = 'master'
  AND m.is_active = true
  AND m.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.project_images w
    WHERE w.project_id = m.project_id
      AND w.kind = 'working_copy'
      AND w.deleted_at IS NULL
  );

UPDATE public.project_images w
SET is_active = true
WHERE w.kind = 'working_copy'
  AND w.is_active = false
  AND w.deleted_at IS NULL
  AND NOT EXISTS (
    -- Don't flip if a filter_working_copy or trace_output is already active
    -- (= user has filters/traces applied; their chain-tip is the editor-active surface).
    SELECT 1 FROM public.project_images other
    WHERE other.project_id = w.project_id
      AND other.is_active = true
      AND other.kind <> 'master'
      AND other.deleted_at IS NULL
  );

-- Step 5: drop the old master-only RPC. No caller after the code update in
-- this PR. Future devs reach for `set_active_image_with_state`.
DROP FUNCTION IF EXISTS public.set_active_master_with_state(uuid, uuid, text, text, text, text);
