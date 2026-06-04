-- Documentation-only migration: attaches COMMENTs to reference-data
-- tables, columns, and policies that are correct-but-non-obvious, so the
-- schema explains its own intent. No structural or behavioural change —
-- COMMENT statements only touch catalog metadata.
--
-- Covers #391 tech-debt items M13, M18, M19, M39. Each block notes its item.
--
-- NOTE (storage squash): the M18 COMMENT below lives on storage.objects.
-- `supabase migration squash --linked` drops the storage schema and the
-- storage RLS DO-block is re-appended by hand (see
-- docs/playbooks/squash-migrations.md) — carry this COMMENT along when that
-- happens, or it is silently lost.

-- ---------------------------------------------------------------------------
-- M13 — *_variants tables are reserved for a future paint-tube-size /
-- inventory feature; intentionally unreferenced by app code today.
-- ---------------------------------------------------------------------------
COMMENT ON TABLE "public"."color_acryl_schmincke_primacryl_variants" IS
  'reserved for future paint-tube-size/inventory feature; intentionally unreferenced by app code';
COMMENT ON TABLE "public"."color_oil_schmincke_norma_variants" IS
  'reserved for future paint-tube-size/inventory feature; intentionally unreferenced by app code';
COMMENT ON TABLE "public"."lab_custom_variants" IS
  'reserved for future paint-tube-size/inventory feature; intentionally unreferenced by app code';
COMMENT ON TABLE "public"."lab_grays_variants" IS
  'reserved for future paint-tube-size/inventory feature; intentionally unreferenced by app code';
COMMENT ON TABLE "public"."lab_munsell_variants" IS
  'reserved for future paint-tube-size/inventory feature; intentionally unreferenced by app code';

-- ---------------------------------------------------------------------------
-- M19 — lab_munsell hue/value/chroma columns are consumed only by the
-- derive_iscc_nbs_name() SQL function, not by application code.
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN "public"."lab_munsell"."hue_family" IS
  'consumed by derive_iscc_nbs_name(); not read by app code';
COMMENT ON COLUMN "public"."lab_munsell"."hue_pct" IS
  'consumed by derive_iscc_nbs_name(); not read by app code';
COMMENT ON COLUMN "public"."lab_munsell"."value" IS
  'consumed by derive_iscc_nbs_name(); not read by app code';
COMMENT ON COLUMN "public"."lab_munsell"."chroma" IS
  'consumed by derive_iscc_nbs_name(); not read by app code';

-- ---------------------------------------------------------------------------
-- M18 — pigment_swatches bucket is read-only by design (single SELECT
-- policy, no insert/update/delete); rows are service-role seeded.
--
-- storage.objects is owned by supabase_storage_admin, so a bare
-- COMMENT ON POLICY fails locally with 42501 (insufficient_privilege) —
-- the local supabase migration runner is neither that role nor a
-- superuser. Same DO-block + exception guard the existing storage RLS
-- policies use (see 20260519130800_seed_color_oil_schmincke_norma.sql):
-- production applies it via the privileged path, local replay skips it
-- as a harmless no-op instead of halting DB bring-up.
-- ---------------------------------------------------------------------------
do $$
begin
  execute $cmt$
    comment on policy "pigment_swatches_select" on "storage"."objects" is
      'pigment swatches are read-only for authenticated users; bucket is service-role seeded (no insert/update/delete policy by design)'
  $cmt$;
exception
  when insufficient_privilege then
    raise notice
      'skipping COMMENT on storage.objects policy — current role lacks ownership; production applies it via a privileged path';
end $$;

-- ---------------------------------------------------------------------------
-- M39 — every reference-data SELECT policy uses USING (true) on purpose:
-- shared, global read-only reference/recipe data with no owner scoping.
-- The comment makes the intent explicit so USING (true) does not read like
-- a missing RLS predicate. Behaviour is unchanged.
-- ---------------------------------------------------------------------------

-- Base palette tables (color_* / lab_*)
COMMENT ON POLICY "color_acryl_schmincke_primacryl_select" ON "public"."color_acryl_schmincke_primacryl" IS
  'global read-only reference data: every authenticated user may read all rows by design (no owner scoping). USING (true) is intentional, not a missing RLS predicate';
COMMENT ON POLICY "color_oil_schmincke_norma_select" ON "public"."color_oil_schmincke_norma" IS
  'global read-only reference data: every authenticated user may read all rows by design (no owner scoping). USING (true) is intentional, not a missing RLS predicate';
COMMENT ON POLICY "lab_custom_select" ON "public"."lab_custom" IS
  'global read-only reference data: every authenticated user may read all rows by design (no owner scoping). USING (true) is intentional, not a missing RLS predicate';
COMMENT ON POLICY "lab_grays_select" ON "public"."lab_grays" IS
  'global read-only reference data: every authenticated user may read all rows by design (no owner scoping). USING (true) is intentional, not a missing RLS predicate';
COMMENT ON POLICY "lab_munsell_select" ON "public"."lab_munsell" IS
  'global read-only reference data: every authenticated user may read all rows by design (no owner scoping). USING (true) is intentional, not a missing RLS predicate';

-- Variants tables (paired with the M13 table comments above)
COMMENT ON POLICY "color_acryl_schmincke_primacryl_variants_select" ON "public"."color_acryl_schmincke_primacryl_variants" IS
  'global read-only reference data: every authenticated user may read all rows by design (no owner scoping). USING (true) is intentional, not a missing RLS predicate';
COMMENT ON POLICY "color_oil_schmincke_norma_variants_select" ON "public"."color_oil_schmincke_norma_variants" IS
  'global read-only reference data: every authenticated user may read all rows by design (no owner scoping). USING (true) is intentional, not a missing RLS predicate';
COMMENT ON POLICY "lab_custom_variants_select" ON "public"."lab_custom_variants" IS
  'global read-only reference data: every authenticated user may read all rows by design (no owner scoping). USING (true) is intentional, not a missing RLS predicate';
COMMENT ON POLICY "lab_grays_variants_select" ON "public"."lab_grays_variants" IS
  'global read-only reference data: every authenticated user may read all rows by design (no owner scoping). USING (true) is intentional, not a missing RLS predicate';
COMMENT ON POLICY "lab_munsell_variants_select" ON "public"."lab_munsell_variants" IS
  'global read-only reference data: every authenticated user may read all rows by design (no owner scoping). USING (true) is intentional, not a missing RLS predicate';

-- Recipes tables (base + components), identical reference-data semantics
COMMENT ON POLICY "recipes_colors_acryl_schmincke_primacryl_select" ON "public"."recipes_colors_acryl_schmincke_primacryl" IS
  'global read-only reference data: every authenticated user may read all rows by design (no owner scoping). USING (true) is intentional, not a missing RLS predicate';
COMMENT ON POLICY "recipes_colors_acryl_schmincke_primacryl_components_select" ON "public"."recipes_colors_acryl_schmincke_primacryl_components" IS
  'global read-only reference data: every authenticated user may read all rows by design (no owner scoping). USING (true) is intentional, not a missing RLS predicate';
COMMENT ON POLICY "recipes_colors_oil_schmincke_norma_select" ON "public"."recipes_colors_oil_schmincke_norma" IS
  'global read-only reference data: every authenticated user may read all rows by design (no owner scoping). USING (true) is intentional, not a missing RLS predicate';
COMMENT ON POLICY "recipes_colors_oil_schmincke_norma_components_select" ON "public"."recipes_colors_oil_schmincke_norma_components" IS
  'global read-only reference data: every authenticated user may read all rows by design (no owner scoping). USING (true) is intentional, not a missing RLS predicate';
COMMENT ON POLICY "recipes_grays_acryl_schmincke_primacryl_select" ON "public"."recipes_grays_acryl_schmincke_primacryl" IS
  'global read-only reference data: every authenticated user may read all rows by design (no owner scoping). USING (true) is intentional, not a missing RLS predicate';
COMMENT ON POLICY "recipes_grays_acryl_schmincke_primacryl_components_select" ON "public"."recipes_grays_acryl_schmincke_primacryl_components" IS
  'global read-only reference data: every authenticated user may read all rows by design (no owner scoping). USING (true) is intentional, not a missing RLS predicate';
COMMENT ON POLICY "recipes_grays_oil_schmincke_norma_select" ON "public"."recipes_grays_oil_schmincke_norma" IS
  'global read-only reference data: every authenticated user may read all rows by design (no owner scoping). USING (true) is intentional, not a missing RLS predicate';
COMMENT ON POLICY "recipes_grays_oil_schmincke_norma_components_select" ON "public"."recipes_grays_oil_schmincke_norma_components" IS
  'global read-only reference data: every authenticated user may read all rows by design (no owner scoping). USING (true) is intentional, not a missing RLS predicate';
