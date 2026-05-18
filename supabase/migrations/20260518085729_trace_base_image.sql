-- Numerate trace now writes a paired bitmap alongside its SVG: the
-- source image cropped to the cell grid's exact rectangle. The new
-- column points project_image_trace at that bitmap so the editor can
-- swap it in as the canvas background under the SVG overlay,
-- eliminating the empty border strip that appeared whenever the
-- cell grid didn't cover the full source.
--
-- ON DELETE RESTRICT: clearProjectTrace tombstones the trace row
-- and both image rows in one go; outside that flow the bitmap must
-- not vanish while a trace still references it.
--
-- Nullable: lineart-trace rows leave it NULL because lineart
-- covers the full image and needs no crop.

ALTER TYPE image_kind ADD VALUE IF NOT EXISTS 'trace_base';

ALTER TABLE project_image_trace
  ADD COLUMN base_image_id uuid
    REFERENCES project_images(id) ON DELETE RESTRICT;

COMMENT ON COLUMN project_image_trace.base_image_id IS
  'project_images row (kind=trace_base) holding the source image cropped to the trace cell grid. NULL for trace kinds without a crop (e.g. lineart).';
