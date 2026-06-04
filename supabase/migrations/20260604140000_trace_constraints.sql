-- Constraint hardening for the image/trace tables (#391 — M14, M15).
-- Both are data-integrity guards; prod was pre-checked read-only before
-- push and had 0 violating rows for each (2026-06-04).

-- ---------------------------------------------------------------------------
-- M14 — validate the existing NOT VALID CHECK on project_images so the
-- "non-master rows must carry a source_image_id" rule is enforced for
-- ALL rows, not just rows written after the constraint was added.
--
-- VALIDATE takes SHARE UPDATE EXCLUSIVE (not ACCESS EXCLUSIVE): it does
-- not block concurrent reads/writes, only a full table scan. Table is
-- tiny so the scan is trivial. Pre-checked on prod: 0 violating rows
-- (kind <> 'master' AND source_image_id IS NULL).
-- ---------------------------------------------------------------------------
ALTER TABLE public.project_images
  VALIDATE CONSTRAINT project_images_non_master_requires_source_kind_ck;

-- ---------------------------------------------------------------------------
-- M15 — crop-bearing traces must carry their base image; lineart is exempt.
-- base_image_id points to the cropped trace_base intermediate. pixelate and
-- circulate always produce one (services/editor/server/trace/shared.ts), so
-- they MUST reference it. lineart produces no trace_base and legitimately
-- leaves base_image_id NULL (services/editor/server/trace/lineart.ts) — a
-- plain NOT NULL would break every lineart apply and every lineart-replace
-- of a prior pixelate. Hence a conditional CHECK, not NOT NULL.
--
-- The trace's actual source image is enforced separately: the trace_output
-- row in project_images carries source_image_id, guarded by M14 above.
--
-- Pre-checked on prod: 0 violating rows; today pixelate=5, circulate=1 (all
-- with base_image_id set), no lineart rows.
--
-- Two-step (ADD NOT VALID, then VALIDATE) keeps the ACCESS EXCLUSIVE lock of
-- ADD short (returns without scanning); the scan runs under the milder
-- SHARE UPDATE EXCLUSIVE lock of VALIDATE.
-- ---------------------------------------------------------------------------
ALTER TABLE public.project_image_trace
  ADD CONSTRAINT project_image_trace_base_image_required_ck
  CHECK (kind = 'lineart' OR base_image_id IS NOT NULL) NOT VALID;

ALTER TABLE public.project_image_trace
  VALIDATE CONSTRAINT project_image_trace_base_image_required_ck;
