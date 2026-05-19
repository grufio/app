-- @intent-schema-migration
--
-- Create recipe tables for the Schmincke Norma Professional sorte:
-- two recipe parents (colors-target, grays-target) and two component
-- tables. Each recipe lists paint shares (% per paint) for one Lab
-- target color. Multiple alternative recipes per target are allowed
-- (UI shows them as Recipe 1 / 2 / 3 ordered by `sequence`).
--
-- Target FK uses nullable column XOR — no separate target_kind discriminator
-- column needed. Per-sorte separation means recipes target Norma paints
-- only; cross-brand mixing is structurally impossible.
--
-- The sum-of-components ≈ 100% invariant is enforced by a deferred
-- AFTER trigger that runs once per modified parent recipe (defined here
-- as a shared function `public.check_recipe_components_sum` so the
-- PRIMAcryl migration can re-bind it).

BEGIN;

-- ---------------------------------------------------------------------
-- Shared sum-check trigger function (created once, bound by each
-- components-table migration that follows).
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."check_recipe_components_sum"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_recipe_id uuid;
  v_table     regclass := TG_ARGV[0]::regclass;
  v_sum       numeric;
BEGIN
  v_recipe_id := COALESCE(NEW.recipe_id, OLD.recipe_id);
  EXECUTE format(
    'SELECT COALESCE(SUM(share_pct), 0) FROM %s WHERE recipe_id = $1',
    v_table
  )
  INTO v_sum
  USING v_recipe_id;
  -- sum = 0 means no components left for this recipe. This happens when
  -- the parent recipe was deleted and child components cascaded out;
  -- treating it as a non-error skips a spurious failure on cascade.
  -- A standalone recipe with zero components is degenerate but harmless
  -- (parent row exists, no mix info), and prevented in practice by app code.
  IF v_sum = 0 THEN
    RETURN NULL;
  END IF;
  IF v_sum NOT BETWEEN 99.5 AND 100.5 THEN
    RAISE EXCEPTION
      'recipe % share_pct sum % out of tolerance [99.5, 100.5]',
      v_recipe_id, v_sum;
  END IF;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------
-- recipes_colors_oil_schmincke_norma: targets lab_munsell OR lab_custom
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."recipes_colors_oil_schmincke_norma" (
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
  CONSTRAINT "recipes_colors_oil_schmincke_norma_target_xor"
    CHECK ((lab_munsell_id IS NULL) <> (lab_custom_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS
  "recipes_colors_oil_schmincke_norma_munsell_seq_uq"
  ON "public"."recipes_colors_oil_schmincke_norma" ("lab_munsell_id", "sequence")
  WHERE "lab_munsell_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS
  "recipes_colors_oil_schmincke_norma_custom_seq_uq"
  ON "public"."recipes_colors_oil_schmincke_norma" ("lab_custom_id", "sequence")
  WHERE "lab_custom_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "public"."recipes_colors_oil_schmincke_norma_components" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "recipe_id"     uuid NOT NULL REFERENCES "public"."recipes_colors_oil_schmincke_norma" ("id") ON DELETE CASCADE,
  "paint_id"      uuid NOT NULL REFERENCES "public"."color_oil_schmincke_norma" ("id") ON DELETE RESTRICT,
  "share_pct"     numeric NOT NULL CHECK (share_pct > 0 AND share_pct <= 100),
  "position"      smallint NOT NULL CHECK (position >= 0),
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "recipes_colors_oil_schmincke_norma_components_pos_uq"
    UNIQUE ("recipe_id", "position"),
  CONSTRAINT "recipes_colors_oil_schmincke_norma_components_paint_uq"
    UNIQUE ("recipe_id", "paint_id")
);

CREATE CONSTRAINT TRIGGER "recipes_colors_oil_schmincke_norma_components_sum_check"
  AFTER INSERT OR UPDATE OR DELETE
  ON "public"."recipes_colors_oil_schmincke_norma_components"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION "public"."check_recipe_components_sum"(
    'public.recipes_colors_oil_schmincke_norma_components'
  );

-- ---------------------------------------------------------------------
-- recipes_grays_oil_schmincke_norma: targets lab_grays OR lab_custom
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."recipes_grays_oil_schmincke_norma" (
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
  CONSTRAINT "recipes_grays_oil_schmincke_norma_target_xor"
    CHECK ((lab_grays_id IS NULL) <> (lab_custom_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS
  "recipes_grays_oil_schmincke_norma_grays_seq_uq"
  ON "public"."recipes_grays_oil_schmincke_norma" ("lab_grays_id", "sequence")
  WHERE "lab_grays_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS
  "recipes_grays_oil_schmincke_norma_custom_seq_uq"
  ON "public"."recipes_grays_oil_schmincke_norma" ("lab_custom_id", "sequence")
  WHERE "lab_custom_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "public"."recipes_grays_oil_schmincke_norma_components" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "recipe_id"     uuid NOT NULL REFERENCES "public"."recipes_grays_oil_schmincke_norma" ("id") ON DELETE CASCADE,
  "paint_id"      uuid NOT NULL REFERENCES "public"."color_oil_schmincke_norma" ("id") ON DELETE RESTRICT,
  "share_pct"     numeric NOT NULL CHECK (share_pct > 0 AND share_pct <= 100),
  "position"      smallint NOT NULL CHECK (position >= 0),
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "recipes_grays_oil_schmincke_norma_components_pos_uq"
    UNIQUE ("recipe_id", "position"),
  CONSTRAINT "recipes_grays_oil_schmincke_norma_components_paint_uq"
    UNIQUE ("recipe_id", "paint_id")
);

CREATE CONSTRAINT TRIGGER "recipes_grays_oil_schmincke_norma_components_sum_check"
  AFTER INSERT OR UPDATE OR DELETE
  ON "public"."recipes_grays_oil_schmincke_norma_components"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION "public"."check_recipe_components_sum"(
    'public.recipes_grays_oil_schmincke_norma_components'
  );

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

ALTER TABLE "public"."recipes_colors_oil_schmincke_norma"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."recipes_colors_oil_schmincke_norma_components" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."recipes_grays_oil_schmincke_norma"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."recipes_grays_oil_schmincke_norma_components"  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipes_colors_oil_schmincke_norma_select"
  ON "public"."recipes_colors_oil_schmincke_norma"            FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "recipes_colors_oil_schmincke_norma_components_select"
  ON "public"."recipes_colors_oil_schmincke_norma_components" FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "recipes_grays_oil_schmincke_norma_select"
  ON "public"."recipes_grays_oil_schmincke_norma"             FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "recipes_grays_oil_schmincke_norma_components_select"
  ON "public"."recipes_grays_oil_schmincke_norma_components"  FOR SELECT TO "authenticated" USING (true);

COMMIT;
