-- @intent-no-type-impact
--
-- Add 'trace_output' to the image_kind enum. Trace SVGs (numerate /
-- lineart outputs) currently share kind='filter_working_copy' with
-- the raster filter chain — which makes editor-target selection
-- ambiguous and has caused multiple bugs. The new kind separates
-- the sink (trace) from the chain (raster filters).
--
-- The actual row-kind backfill lives in the next migration: enum
-- additions can land in the same transaction as their use in
-- Postgres 12+, but keeping the ALTER TYPE in its own migration
-- file avoids "unsafe use of new value in same transaction" edge
-- cases across Supabase CLI versions.

ALTER TYPE "public"."image_kind" ADD VALUE IF NOT EXISTS 'trace_output';
