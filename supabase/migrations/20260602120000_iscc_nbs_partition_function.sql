-- @intent-additive-data-update
--
-- Rewrite of #363's seed: instead of 176 chip-specific
-- `UPDATE … WHERE notation = 'X'` lines (which only matched the
-- standard Munsell-book chip set #363's author was working from and
-- left every Schmincke-Norma chip NULL because their notations don't
-- overlap), this migration installs a SQL function that derives an
-- ISCC-NBS-style name purely from the chip's columnar Munsell
-- coordinates (`hue_family`, `hue_pct`, `value`, `chroma`). That
-- runs against every row in `lab_munsell` and `lab_grays` regardless
-- of the upstream palette source — Schmincke, the Munsell book, or
-- any future seeded palette.
--
-- The partition is a pragmatic simplification of Kelly & Judd 1976
-- (Color: Universal Language and Dictionary of Names). It does NOT
-- reproduce all 267 ISCC-NBS Level-3 regions exactly; it covers the
-- major lightness / saturation / hue distinctions in a single
-- readable CASE so every chip gets a descriptive, consistent name.
-- Refining to the full 267-region partition is a follow-up.

CREATE OR REPLACE FUNCTION "public"."derive_iscc_nbs_name"(
  "hue_family" text,
  "hue_pct" numeric,
  "value" numeric,
  "chroma" numeric
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  base text;
  saturation text;
  lightness text;
  name text;
BEGIN
  -- Neutrals: bucket by value only. Aligns with the Kelly-Judd
  -- neutral split-points (Black <1, Dark gray <3.5, Medium gray
  -- <6.5, Light gray <8.5, White ≥8.5).
  IF "hue_family" = 'N' OR "hue_family" IS NULL THEN
    RETURN CASE
      WHEN "value" < 1.0  THEN 'Black'
      WHEN "value" < 3.5  THEN 'Dark gray'
      WHEN "value" < 6.5  THEN 'Medium gray'
      WHEN "value" < 8.5  THEN 'Light gray'
      ELSE                     'White'
    END;
  END IF;

  -- Base hue word. The hue_pct (2.5 / 5 / 7.5 / 10) within a family
  -- shifts the perceived hue toward the neighbouring family; this
  -- partition keeps the within-family modifier coarse so the names
  -- stay readable. Values of `value` / `chroma` make a strong chip
  -- a "yellow", a desaturated dark chip a "brown", etc. — that
  -- value-modulated mapping happens below for YR specifically.
  base := CASE "hue_family"
    WHEN 'R'  THEN 'red'
    WHEN 'YR' THEN 'orange'  -- refined below by value / chroma
    WHEN 'Y'  THEN 'yellow'
    WHEN 'GY' THEN 'yellow green'
    WHEN 'G'  THEN 'green'
    WHEN 'BG' THEN 'bluish green'
    WHEN 'B'  THEN 'blue'
    WHEN 'PB' THEN 'purplish blue'
    WHEN 'P'  THEN 'purple'
    WHEN 'RP' THEN 'reddish purple'
    ELSE          'gray'
  END;

  -- YR (yellow-red) is special: low-value low-chroma reads as
  -- "brown", mid-value mid-chroma as "orange", high-value as
  -- "orange yellow". This is the most common practical distinction
  -- in the Schmincke palette so it gets dedicated handling.
  IF "hue_family" = 'YR' THEN
    IF "chroma" < 3 AND "value" < 6 THEN
      base := 'brown';
    ELSIF "value" < 4 AND "chroma" >= 4 THEN
      base := 'brown';  -- "Strong brown" / "Dark brown" regions
    ELSIF "value" >= 7 THEN
      base := 'orange yellow';
    ELSE
      base := 'orange';
    END IF;
  END IF;

  -- Saturation modifier from chroma. ISCC-NBS uses "Vivid",
  -- "Strong", "Moderate", "Grayish", with a fuzzy boundary at
  -- C≈10-12. The thresholds here pick the descriptive word that
  -- matches the chip's perceptual punch.
  saturation := CASE
    WHEN "chroma" >= 12 THEN 'Vivid'
    WHEN "chroma" >= 8  THEN 'Strong'
    WHEN "chroma" >= 4  THEN 'Moderate'
    WHEN "chroma" >= 2  THEN 'Grayish'
    ELSE                     'Near-neutral'
  END;

  -- Lightness modifier from value. Mid-band chips get no
  -- light/dark prefix — the saturation word carries the name.
  lightness := CASE
    WHEN "value" < 2.0 THEN 'Very dark'
    WHEN "value" < 3.5 THEN 'Dark'
    WHEN "value" < 6.5 THEN ''
    WHEN "value" < 8.5 THEN 'Light'
    ELSE                    'Very light'
  END;

  -- Compose, trimming empties to avoid "  red".
  IF lightness = '' THEN
    name := saturation || ' ' || base;
  ELSE
    name := lightness || ' ' || lower(saturation) || ' ' || base;
  END IF;

  -- Capitalise first letter (matches the existing dictionary
  -- entries like "Vivid red" / "Dark grayish blue").
  RETURN upper(substring(name, 1, 1)) || substring(name, 2);
END;
$$;


-- Apply to every chip. Overwrites any names the old per-chip seed
-- may have set — those that match the dictionary survive (e.g.
-- "Vivid red" for a chroma-16 mid-value red), those that mismatch
-- get the partition's deterministic value.
UPDATE "public"."lab_munsell"
   SET "iscc_nbs_name" = "public"."derive_iscc_nbs_name"(
     "hue_family", "hue_pct", "value", "chroma"
   );

UPDATE "public"."lab_grays"
   SET "iscc_nbs_name" = "public"."derive_iscc_nbs_name"(
     -- lab_grays has no hue_family/hue_pct/chroma columns; pass 'N'
     -- + 0s so the function takes the neutral branch.
     'N', 0, "value", 0
   );
