-- @intent-schema-migration
--
-- Recipe tables for the Schmincke PRIMAcryl sorte. Structurally identical
-- to the Norma Oil recipes migration; FKs point to the PRIMAcryl paint
-- table instead. Bound to the shared sum-check function defined in the
-- preceding Norma migration.
--
-- Tables stay empty until PRIMAcryl recipe data is provided.

BEGIN;

-- ---------------------------------------------------------------------
-- recipes_colors_acryl_schmincke_primacryl: targets lab_munsell OR lab_custom
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."recipes_colors_acryl_schmincke_primacryl" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "lab_munsell_id"   uuid REFERENCES "public"."lab_munsell" ("id") ON DELETE CASCADE,
  "lab_custom_id"    uuid REFERENCES "public"."lab_custom"  ("id") ON DELETE CASCADE,
  "preview_rgb_r"    smallint NOT NULL CHECK (preview_rgb_r BETWEEN 0 AND 255),
  "preview_rgb_g"    smallint NOT NULL CHECK (preview_rgb_g BETWEEN 0 AND 255),
  "preview_rgb_b"    smallint NOT NULL CHECK (preview_rgb_b BETWEEN 0 AND 255),
  "sequence"         smallint NOT NULL CHECK (sequence >= 1),
  "notes"            text,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  "updated_at"       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "recipes_colors_acryl_schmincke_primacryl_target_xor"
    CHECK ((lab_munsell_id IS NULL) <> (lab_custom_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS
  "recipes_colors_acryl_schmincke_primacryl_munsell_seq_uq"
  ON "public"."recipes_colors_acryl_schmincke_primacryl" ("lab_munsell_id", "sequence")
  WHERE "lab_munsell_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS
  "recipes_colors_acryl_schmincke_primacryl_custom_seq_uq"
  ON "public"."recipes_colors_acryl_schmincke_primacryl" ("lab_custom_id", "sequence")
  WHERE "lab_custom_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "public"."recipes_colors_acryl_schmincke_primacryl_components" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "recipe_id"     uuid NOT NULL REFERENCES "public"."recipes_colors_acryl_schmincke_primacryl" ("id") ON DELETE CASCADE,
  "paint_id"      uuid NOT NULL REFERENCES "public"."color_acryl_schmincke_primacryl" ("id") ON DELETE RESTRICT,
  "share_pct"     numeric NOT NULL CHECK (share_pct > 0 AND share_pct <= 100),
  "position"      smallint NOT NULL CHECK (position >= 0),
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "recipes_colors_acryl_schmincke_primacryl_components_pos_uq"
    UNIQUE ("recipe_id", "position"),
  CONSTRAINT "recipes_colors_acryl_schmincke_primacryl_components_paint_uq"
    UNIQUE ("recipe_id", "paint_id")
);

CREATE CONSTRAINT TRIGGER "recipes_colors_acryl_schmincke_primacryl_components_sum_check"
  AFTER INSERT OR UPDATE OR DELETE
  ON "public"."recipes_colors_acryl_schmincke_primacryl_components"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION "public"."check_recipe_components_sum"(
    'public.recipes_colors_acryl_schmincke_primacryl_components'
  );

-- ---------------------------------------------------------------------
-- recipes_grays_acryl_schmincke_primacryl: targets lab_grays OR lab_custom
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."recipes_grays_acryl_schmincke_primacryl" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "lab_grays_id"     uuid REFERENCES "public"."lab_grays"  ("id") ON DELETE CASCADE,
  "lab_custom_id"    uuid REFERENCES "public"."lab_custom" ("id") ON DELETE CASCADE,
  "preview_rgb_r"    smallint NOT NULL CHECK (preview_rgb_r BETWEEN 0 AND 255),
  "preview_rgb_g"    smallint NOT NULL CHECK (preview_rgb_g BETWEEN 0 AND 255),
  "preview_rgb_b"    smallint NOT NULL CHECK (preview_rgb_b BETWEEN 0 AND 255),
  "sequence"         smallint NOT NULL CHECK (sequence >= 1),
  "notes"            text,
  "created_at"       timestamptz NOT NULL DEFAULT now(),
  "updated_at"       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "recipes_grays_acryl_schmincke_primacryl_target_xor"
    CHECK ((lab_grays_id IS NULL) <> (lab_custom_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS
  "recipes_grays_acryl_schmincke_primacryl_grays_seq_uq"
  ON "public"."recipes_grays_acryl_schmincke_primacryl" ("lab_grays_id", "sequence")
  WHERE "lab_grays_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS
  "recipes_grays_acryl_schmincke_primacryl_custom_seq_uq"
  ON "public"."recipes_grays_acryl_schmincke_primacryl" ("lab_custom_id", "sequence")
  WHERE "lab_custom_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "public"."recipes_grays_acryl_schmincke_primacryl_components" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "recipe_id"     uuid NOT NULL REFERENCES "public"."recipes_grays_acryl_schmincke_primacryl" ("id") ON DELETE CASCADE,
  "paint_id"      uuid NOT NULL REFERENCES "public"."color_acryl_schmincke_primacryl" ("id") ON DELETE RESTRICT,
  "share_pct"     numeric NOT NULL CHECK (share_pct > 0 AND share_pct <= 100),
  "position"      smallint NOT NULL CHECK (position >= 0),
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "recipes_grays_acryl_schmincke_primacryl_components_pos_uq"
    UNIQUE ("recipe_id", "position"),
  CONSTRAINT "recipes_grays_acryl_schmincke_primacryl_components_paint_uq"
    UNIQUE ("recipe_id", "paint_id")
);

CREATE CONSTRAINT TRIGGER "recipes_grays_acryl_schmincke_primacryl_components_sum_check"
  AFTER INSERT OR UPDATE OR DELETE
  ON "public"."recipes_grays_acryl_schmincke_primacryl_components"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION "public"."check_recipe_components_sum"(
    'public.recipes_grays_acryl_schmincke_primacryl_components'
  );

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

ALTER TABLE "public"."recipes_colors_acryl_schmincke_primacryl"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."recipes_colors_acryl_schmincke_primacryl_components" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."recipes_grays_acryl_schmincke_primacryl"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."recipes_grays_acryl_schmincke_primacryl_components"  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipes_colors_acryl_schmincke_primacryl_select"
  ON "public"."recipes_colors_acryl_schmincke_primacryl"            FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "recipes_colors_acryl_schmincke_primacryl_components_select"
  ON "public"."recipes_colors_acryl_schmincke_primacryl_components" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "recipes_grays_acryl_schmincke_primacryl_select"
  ON "public"."recipes_grays_acryl_schmincke_primacryl"             FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "recipes_grays_acryl_schmincke_primacryl_components_select"
  ON "public"."recipes_grays_acryl_schmincke_primacryl_components"  FOR SELECT TO "authenticated" USING (true);

COMMIT;
