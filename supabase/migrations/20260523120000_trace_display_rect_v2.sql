-- Re-introduce the per-trace display rect on project_image_trace
-- (Invariant 2 of the display-size + trace rebuild, stage 2).
--
-- A trace is a standalone object with its own frozen geometry: the
-- master/working_copy display rect that was authoritative at apply
-- time, captured ONCE and stored on the trace row. The overlay (stage
-- 3) renders from THIS rect, decoupled from the live canvas transform,
-- so the rendered size/aspect can no longer drift with imageTx.
--
-- This is the #239 model (PR 78191514) rebuilt cleanly. It was added
-- in 20260520221904 (trace_display_rect), then dropped again in
-- 20260521101858 (trace_master_pre_state, the destructive-crop PR #248
-- that replaced it with master_pre_*), which in turn was dropped in
-- 20260521205316. Net result of that chain: prod AND local carry
-- neither display_* nor master_pre_* (verified read-only via
-- `\d project_image_trace` against the prod pooler and the local
-- instance on 2026-05-23 — both show only project_id/kind/params/
-- output_image_id/created_at/updated_at/base_image_id). The file
-- chain is therefore internally consistent with both databases; there
-- is no untracked drift to reconcile.
--
-- Storage convention: text-encoded canonical-px-times-1e6 (µpx),
-- mirroring project_image_state (x/y/width/height_px_u are text there)
-- and project_images.initial_display_*_px_u. Text avoids the JS-Number
-- precision question; the client wraps with BigInt() on read.
--
-- DEFAULT '0' is the legacy-row signal: a trace whose
-- display_width_px_u is '0' has no fixed rect (legacy row or lineart)
-- and the editor falls back to the master-state render path. Existing
-- traces keep working until re-applied.
--
-- IF NOT EXISTS makes this idempotent: the columns do not exist in
-- either database today, so this adds them on both; re-running (or a
-- hypothetical environment that already has them) is a no-op rather
-- than a "column already exists" failure.

ALTER TABLE public.project_image_trace
  ADD COLUMN IF NOT EXISTS display_x_px_u text NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS display_y_px_u text NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS display_width_px_u text NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS display_height_px_u text NOT NULL DEFAULT '0';
