-- @intent-schema-migration
--
-- Create the manufacturer-paint tables for Schmincke Norma Professional
-- (oil paints, 84 colors, available in 35/120/200 ml tubes).
--
-- Two tables: paint catalog (color spec) + variants (per-tube-size
-- inventory + price). Recipes reference the paint, not a variant — a
-- recipe doesn't care which tube size you buy.
--
-- Global reference data, no owner_id. RLS allows SELECT for authenticated
-- users; writes via service_role only (migration + future enrichment
-- migrations).

BEGIN;

CREATE TABLE IF NOT EXISTS "public"."color_oil_schmincke_norma" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code"                text NOT NULL,
  "name"                text NOT NULL,
  "density_g_per_ml"    numeric CHECK (density_g_per_ml > 0),
  "swatch_storage_path" text,
  "pigment_codes"       text[],
  "lightfastness"       smallint CHECK (lightfastness BETWEEN 1 AND 5),
  "opacity"             text CHECK (opacity IN ('opaque','semi_opaque','semi_transparent')),
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "color_oil_schmincke_norma_code_unique" UNIQUE ("code")
);

CREATE TABLE IF NOT EXISTS "public"."color_oil_schmincke_norma_variants" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "paint_id"           uuid NOT NULL REFERENCES "public"."color_oil_schmincke_norma" ("id") ON DELETE CASCADE,
  "size_ml"            smallint NOT NULL CHECK (size_ml > 0),
  "stock_count"        smallint NOT NULL DEFAULT 0 CHECK (stock_count >= 0),
  "weight_g"           numeric CHECK (weight_g > 0),
  "price_eur"          numeric(10, 2) CHECK (price_eur >= 0),
  "price_updated_at"   timestamptz,
  "sku"                text,
  "created_at"         timestamptz NOT NULL DEFAULT now(),
  "updated_at"         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "color_oil_schmincke_norma_variants_unique"
    UNIQUE ("paint_id", "size_ml"),
  CONSTRAINT "color_oil_schmincke_norma_variants_price_paired"
    CHECK ((price_eur IS NULL) = (price_updated_at IS NULL))
);

ALTER TABLE "public"."color_oil_schmincke_norma"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."color_oil_schmincke_norma_variants" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "color_oil_schmincke_norma_select"
  ON "public"."color_oil_schmincke_norma"          FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "color_oil_schmincke_norma_variants_select"
  ON "public"."color_oil_schmincke_norma_variants" FOR SELECT TO "authenticated" USING (true);

COMMIT;
