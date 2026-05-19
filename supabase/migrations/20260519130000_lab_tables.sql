-- @intent-schema-migration
--
-- Create the three Lab color pools (lab_munsell, lab_grays, lab_custom)
-- plus their per-tube-size inventory tables. These tables hold the
-- target color specifications that the Pixelate filter quantizes against,
-- and track the user's hand-mixed tube stock for each Lab color.
--
-- All Lab tables are GLOBAL reference data — no owner_id, no per-user
-- scoping. RLS allows SELECT for any authenticated user; only service_role
-- writes (via migrations + REST-provider backend for lab_custom).
--
-- Source for the chromatic palette and gray ramp: the color-lab Python
-- project (gitignored), specifically:
--   color-lab/output/palette-colors.json (128 entries) → lab_munsell
--   color-lab/output/palette-grey.json (48 entries)    → lab_grays
-- lab_custom grows dynamically as the REST recipe provider returns
-- mixings for arbitrary RGB targets.

BEGIN;

-- ---------------------------------------------------------------------
-- lab_munsell: 128 chromatic Munsell-renotation chips (the color master)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."lab_munsell" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "notation"      text NOT NULL,
  "palette_index" smallint NOT NULL CHECK (palette_index >= 0),
  "hue_pct"       numeric NOT NULL,
  "hue_family"    text NOT NULL,
  "value"         numeric NOT NULL,
  "chroma"        numeric NOT NULL,
  "oklab_l"       double precision NOT NULL,
  "oklab_a"       double precision NOT NULL,
  "oklab_b"       double precision NOT NULL,
  "rgb_r"         smallint NOT NULL CHECK (rgb_r BETWEEN 0 AND 255),
  "rgb_g"         smallint NOT NULL CHECK (rgb_g BETWEEN 0 AND 255),
  "rgb_b"         smallint NOT NULL CHECK (rgb_b BETWEEN 0 AND 255),
  "hex"           text NOT NULL CHECK (hex ~ '^#[0-9A-Fa-f]{6}$'),
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "lab_munsell_notation_unique"      UNIQUE ("notation"),
  CONSTRAINT "lab_munsell_palette_index_unique" UNIQUE ("palette_index")
);

CREATE TABLE IF NOT EXISTS "public"."lab_munsell_variants" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "lab_munsell_id"  uuid NOT NULL REFERENCES "public"."lab_munsell" ("id") ON DELETE CASCADE,
  "size_ml"         smallint NOT NULL CHECK (size_ml > 0),
  "stock_count"     smallint NOT NULL DEFAULT 0 CHECK (stock_count >= 0),
  "weight_g"        numeric CHECK (weight_g > 0),
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "lab_munsell_variants_unique" UNIQUE ("lab_munsell_id", "size_ml")
);

-- ---------------------------------------------------------------------
-- lab_grays: 48 neutral N-scale ramp (the gray master)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."lab_grays" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "notation"      text NOT NULL,
  "palette_index" smallint NOT NULL CHECK (palette_index >= 0),
  "value"         numeric NOT NULL,
  "oklab_l"       double precision NOT NULL,
  "oklab_a"       double precision NOT NULL,
  "oklab_b"       double precision NOT NULL,
  "rgb_r"         smallint NOT NULL CHECK (rgb_r BETWEEN 0 AND 255),
  "rgb_g"         smallint NOT NULL CHECK (rgb_g BETWEEN 0 AND 255),
  "rgb_b"         smallint NOT NULL CHECK (rgb_b BETWEEN 0 AND 255),
  "hex"           text NOT NULL CHECK (hex ~ '^#[0-9A-Fa-f]{6}$'),
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "lab_grays_notation_unique"      UNIQUE ("notation"),
  CONSTRAINT "lab_grays_palette_index_unique" UNIQUE ("palette_index")
);

CREATE TABLE IF NOT EXISTS "public"."lab_grays_variants" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "lab_grays_id"  uuid NOT NULL REFERENCES "public"."lab_grays" ("id") ON DELETE CASCADE,
  "size_ml"       smallint NOT NULL CHECK (size_ml > 0),
  "stock_count"   smallint NOT NULL DEFAULT 0 CHECK (stock_count >= 0),
  "weight_g"      numeric CHECK (weight_g > 0),
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "lab_grays_variants_unique" UNIQUE ("lab_grays_id", "size_ml")
);

-- ---------------------------------------------------------------------
-- lab_custom: arbitrary RGB targets, dynamically added via REST provider
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."lab_custom" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "rgb_r"       smallint NOT NULL CHECK (rgb_r BETWEEN 0 AND 255),
  "rgb_g"       smallint NOT NULL CHECK (rgb_g BETWEEN 0 AND 255),
  "rgb_b"       smallint NOT NULL CHECK (rgb_b BETWEEN 0 AND 255),
  "hex"         text NOT NULL CHECK (hex ~ '^#[0-9A-Fa-f]{6}$'),
  "oklab_l"     double precision NOT NULL,
  "oklab_a"     double precision NOT NULL,
  "oklab_b"     double precision NOT NULL,
  "name"        text,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "lab_custom_rgb_unique" UNIQUE ("rgb_r", "rgb_g", "rgb_b")
);

CREATE TABLE IF NOT EXISTS "public"."lab_custom_variants" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "lab_custom_id"  uuid NOT NULL REFERENCES "public"."lab_custom" ("id") ON DELETE CASCADE,
  "size_ml"        smallint NOT NULL CHECK (size_ml > 0),
  "stock_count"    smallint NOT NULL DEFAULT 0 CHECK (stock_count >= 0),
  "weight_g"       numeric CHECK (weight_g > 0),
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "lab_custom_variants_unique" UNIQUE ("lab_custom_id", "size_ml")
);

-- ---------------------------------------------------------------------
-- RLS: global read for authenticated users; writes via service_role only.
-- No explicit INSERT/UPDATE/DELETE policies means non-service-role
-- writes are rejected by RLS even when authenticated.
-- ---------------------------------------------------------------------

ALTER TABLE "public"."lab_munsell"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lab_munsell_variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lab_grays"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lab_grays_variants"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lab_custom"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."lab_custom_variants"  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lab_munsell_select"
  ON "public"."lab_munsell"          FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "lab_munsell_variants_select"
  ON "public"."lab_munsell_variants" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "lab_grays_select"
  ON "public"."lab_grays"            FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "lab_grays_variants_select"
  ON "public"."lab_grays_variants"   FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "lab_custom_select"
  ON "public"."lab_custom"           FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "lab_custom_variants_select"
  ON "public"."lab_custom_variants"  FOR SELECT TO "authenticated" USING (true);

COMMIT;
