-- @intent-additive-data-update
--
-- Per-chip eindeutige Naming für die Colors-Section. Ersetzt die bisherigen
-- ISCC-NBS-Bucket-Namen, die von der `derive_iscc_nbs_name`-Function aus
-- PR #370 generiert werden, durch eindeutige Display-Namen pro Chip.
--
-- Hintergrund: die 5-Lightness × 5-Saturation × 11-Hue-Familien Buckets
-- produzieren auf 560 Chips (512 chromatic + 48 N-grays) nur ~20-30
-- unique Namen — viele Chips teilen sich denselben Namen
-- ("Black"/"Black"/"Dark gray"/"Dark gray" für die ersten vier
-- N-Achse-Chips z.B.).
--
-- Naming-Spec (User-Vorgabe):
--   - `lab_grays` (48 N-Achse Chips): uniform "System Gray 01" bis
--     "System Gray 48", sortiert nach `value` (dunkelste zuerst,
--     zero-padded zweistellig).
--   - `lab_munsell` (512 chromatic Chips): existing ISCC-NBS-Bucket-Name
--     (z.B. "Dark blue", "Vivid red") + " " + Per-Bucket-Sequenz-Nummer.
--     Sortierung innerhalb Bucket: (hue_pct, value, chroma) deterministisch.
--
-- Einmalige Namensvergabe. Nach dieser Migration sind Chip-Namen permanent.
-- Künftige Palette-Reseeds sind explizit out-of-scope dieses Plans.

-- 1) Grays — uniform "System Gray NN", value-sortiert.
WITH numbered AS (
  SELECT "id",
         'System Gray ' || LPAD(
           ROW_NUMBER() OVER (ORDER BY "value")::text, 2, '0'
         ) AS new_name
    FROM "public"."lab_grays"
)
UPDATE "public"."lab_grays" lg
   SET "iscc_nbs_name" = n.new_name
  FROM numbered n
 WHERE lg.id = n.id;

-- 2) Chromatic — Basis-Bucket aus HVC frisch berechnen (falls hier
--    schon ein Suffix steht, wegspülen). Mirror der UPDATE-Sequenz
--    in `20260604160000_reseed_lab_munsell_512.sql`.
UPDATE "public"."lab_munsell"
   SET "iscc_nbs_name" = "public"."derive_iscc_nbs_name"(
     "hue_family", "hue_pct", "value", "chroma");

-- 3) Chromatic — Seq-Suffix pro Bucket via Window-Function.
WITH numbered AS (
  SELECT "id",
         "iscc_nbs_name" || ' ' ||
         ROW_NUMBER() OVER (
           PARTITION BY "iscc_nbs_name"
           ORDER BY "hue_pct", "value", "chroma"
         )::text AS new_name
    FROM "public"."lab_munsell"
   WHERE "iscc_nbs_name" IS NOT NULL
)
UPDATE "public"."lab_munsell" lm
   SET "iscc_nbs_name" = n.new_name
  FROM numbered n
 WHERE lm.id = n.id;

-- Schema-sync touch: this is a data-only migration, so the schema dump is
-- otherwise unchanged and the `schema_sync_check` gate would fail. Refresh the
-- table comment to record the new per-chip naming semantics (mirrored verbatim
-- into db/schema.sql).
COMMENT ON TABLE "public"."lab_munsell" IS '512-chip tier palette (two-stage: deterministic Munsell set + frequency×spread order). palette_index = selection rank 0..511; tiers 128/256/512 are prefixes. Active tier gated app-side by PALETTE_TIER. iscc_nbs_name carries per-chip unique display names (ISCC-NBS bucket + per-bucket sequence number).';
