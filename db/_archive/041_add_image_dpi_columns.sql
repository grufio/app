-- Migration 041: Add DPI and bit depth columns to project_images
--
-- These columns store image metadata for DPI-based initial scaling:
-- - dpi_x, dpi_y: Dots per inch from EXIF or fallback (72)
-- - bit_depth: Color depth (8, 16, etc.)

alter table public.project_images
  add column if not exists dpi_x numeric not null default 72 check (dpi_x > 0),
  add column if not exists dpi_y numeric not null default 72 check (dpi_y > 0),
  add column if not exists bit_depth integer not null default 8 check (bit_depth > 0);
