-- Artboard print-margin padding on project_workspace.
--
-- Padding = the distance from the image area to the page (Seite) on each of the
-- four sides. Canonical in µpx (BigInt-as-text), following the sizing invariant
-- (`docs/specs/sizing-invariants.mdx`: never persist unit-specific mm/cm values;
-- px_u is the truth, the mm display is derived at the edge). Entered in mm.
--
-- 0 is allowed (no margin) — deliberately different from width/height, which
-- require >= 1px (1_000_000 µpx). Upper bound = MAX_PX_U (32768 px) like the
-- other px_u columns. No px cache: padding needs no integer-px tile.
--
-- Used (this change) only for the grey preview strip in the canvas; the autocrop
-- that consumes it lands in a separate, later change.
--
-- IF NOT EXISTS keeps the column add idempotent.
ALTER TABLE public.project_workspace
  ADD COLUMN IF NOT EXISTS padding_top_px_u    text NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS padding_bottom_px_u text NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS padding_left_px_u   text NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS padding_right_px_u  text NOT NULL DEFAULT '0';

ALTER TABLE public.project_workspace
  ADD CONSTRAINT project_workspace_padding_top_px_u_range
    CHECK ((("padding_top_px_u")::bigint >= 0) AND (("padding_top_px_u")::bigint <= 32768000000)),
  ADD CONSTRAINT project_workspace_padding_bottom_px_u_range
    CHECK ((("padding_bottom_px_u")::bigint >= 0) AND (("padding_bottom_px_u")::bigint <= 32768000000)),
  ADD CONSTRAINT project_workspace_padding_left_px_u_range
    CHECK ((("padding_left_px_u")::bigint >= 0) AND (("padding_left_px_u")::bigint <= 32768000000)),
  ADD CONSTRAINT project_workspace_padding_right_px_u_range
    CHECK ((("padding_right_px_u")::bigint >= 0) AND (("padding_right_px_u")::bigint <= 32768000000));
