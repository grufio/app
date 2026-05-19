-- @intent-schema-migration
--
-- Create the manufacturer-paint tables for Schmincke PRIMAcryl
-- (heavy-body acryls, 90 colors, available in 35/60/150/250/500 ml plus
-- 237/474 ml fluid lines).
--
-- Tables are structurally identical to color_oil_schmincke_norma; the
-- per-sorte separation makes cross-brand mixing in recipes structurally
-- impossible (no shared FK target). Data is not in the current SQLite
-- import — tables stay empty until a catalog source is identified.

BEGIN;

CREATE TABLE IF NOT EXISTS "public"."color_acryl_schmincke_primacryl" (
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
  CONSTRAINT "color_acryl_schmincke_primacryl_code_unique" UNIQUE ("code")
);

CREATE TABLE IF NOT EXISTS "public"."color_acryl_schmincke_primacryl_variants" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "paint_id"           uuid NOT NULL REFERENCES "public"."color_acryl_schmincke_primacryl" ("id") ON DELETE CASCADE,
  "size_ml"            smallint NOT NULL CHECK (size_ml > 0),
  "stock_count"        smallint NOT NULL DEFAULT 0 CHECK (stock_count >= 0),
  "weight_g"           numeric CHECK (weight_g > 0),
  "price_eur"          numeric(10, 2) CHECK (price_eur >= 0),
  "price_updated_at"   timestamptz,
  "sku"                text,
  "created_at"         timestamptz NOT NULL DEFAULT now(),
  "updated_at"         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "color_acryl_schmincke_primacryl_variants_unique"
    UNIQUE ("paint_id", "size_ml"),
  CONSTRAINT "color_acryl_schmincke_primacryl_variants_price_paired"
    CHECK ((price_eur IS NULL) = (price_updated_at IS NULL))
);

ALTER TABLE "public"."color_acryl_schmincke_primacryl"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."color_acryl_schmincke_primacryl_variants" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "color_acryl_schmincke_primacryl_select"
  ON "public"."color_acryl_schmincke_primacryl"          FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "color_acryl_schmincke_primacryl_variants_select"
  ON "public"."color_acryl_schmincke_primacryl_variants" FOR SELECT TO "authenticated" USING (true);

COMMIT;
