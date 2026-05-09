


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."color_space" AS ENUM (
    'rgb',
    'cmyk'
);


ALTER TYPE "public"."color_space" OWNER TO "postgres";


CREATE TYPE "public"."image_kind" AS ENUM (
    'master',
    'working_copy',
    'filter_working_copy'
);


ALTER TYPE "public"."image_kind" OWNER TO "postgres";


CREATE TYPE "public"."image_role" AS ENUM (
    'master',
    'working',
    'asset'
);


ALTER TYPE "public"."image_role" OWNER TO "postgres";


CREATE TYPE "public"."measure_unit" AS ENUM (
    'mm',
    'cm',
    'pt',
    'px'
);


ALTER TYPE "public"."measure_unit" OWNER TO "postgres";


CREATE TYPE "public"."project_status" AS ENUM (
    'in_progress',
    'completed',
    'archived'
);


ALTER TYPE "public"."project_status" OWNER TO "postgres";


CREATE TYPE "public"."workflow_step" AS ENUM (
    'image',
    'filter',
    'convert',
    'output'
);


ALTER TYPE "public"."workflow_step" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."append_project_image_filter"("p_project_id" "uuid", "p_input_image_id" "uuid", "p_output_image_id" "uuid", "p_filter_type" "text", "p_filter_params" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_last_output uuid;
  v_next_order integer;
  v_inserted_id uuid;
  v_input_project_id uuid;
  v_output_project_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));

  select project_id
    into v_input_project_id
  from public.project_images
  where id = p_input_image_id
    and deleted_at is null;

  if v_input_project_id is distinct from p_project_id then
    raise exception 'input_image_id is not part of project'
      using errcode = '23503';
  end if;

  select project_id
    into v_output_project_id
  from public.project_images
  where id = p_output_image_id
    and deleted_at is null;

  if v_output_project_id is distinct from p_project_id then
    raise exception 'output_image_id is not part of project'
      using errcode = '23503';
  end if;

  select f.output_image_id
    into v_last_output
  from public.project_image_filters f
  where f.project_id = p_project_id
  order by f.stack_order desc
  limit 1;

  if v_last_output is not null and v_last_output <> p_input_image_id then
    raise exception 'filter chain tip mismatch'
      using errcode = '23514';
  end if;

  select coalesce(max(stack_order), 0) + 1
    into v_next_order
  from public.project_image_filters
  where project_id = p_project_id;

  insert into public.project_image_filters (
    project_id,
    input_image_id,
    output_image_id,
    filter_type,
    filter_params,
    stack_order
  ) values (
    p_project_id,
    p_input_image_id,
    p_output_image_id,
    p_filter_type,
    coalesce(p_filter_params, '{}'::jsonb),
    v_next_order
  )
  returning id into v_inserted_id;

  return v_inserted_id;
end;
$$;


ALTER FUNCTION "public"."append_project_image_filter"("p_project_id" "uuid", "p_input_image_id" "uuid", "p_output_image_id" "uuid", "p_filter_type" "text", "p_filter_params" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_project"("p_project_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_owner uuid;
  v_deleted uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));

  select owner_id
    into v_owner
  from public.projects
  where id = p_project_id;

  if v_owner is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  -- Signal guard_master_immutable that the whole project tree is being
  -- torn down so the cascade can include master rows. Transaction-local.
  perform set_config('app.deleting_project', p_project_id::text, true);

  delete from public.project_image_filters
   where project_id = p_project_id;

  delete from public.projects
   where id = p_project_id
   returning id into v_deleted;

  if v_deleted is null then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  return v_deleted;
end;
$$;


ALTER FUNCTION "public"."delete_project"("p_project_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_master_immutable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_in_project_delete text;
begin
  -- Allow cascade deletes performed by delete_project(). The setting is
  -- transaction-scoped via set_config(..., true), so external callers
  -- cannot pre-set it to bypass the guard on regular operations.
  v_in_project_delete := current_setting('app.deleting_project', true);
  if v_in_project_delete is not null
     and v_in_project_delete <> ''
     and (tg_op = 'DELETE' or tg_op = 'UPDATE')
     and old.project_id::text = v_in_project_delete then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' and old.kind = 'master' then
    raise exception using
      message = 'master image is immutable',
      detail = format('project_id=%s image_id=%s', old.project_id, old.id),
      hint = 'Use restore/activation flow instead of deleting the master image.';
  end if;

  if tg_op = 'UPDATE' and old.kind = 'master' then
    if new.name is distinct from old.name
       or new.format is distinct from old.format
       or new.width_px is distinct from old.width_px
       or new.height_px is distinct from old.height_px
       or new.storage_bucket is distinct from old.storage_bucket
       or new.storage_path is distinct from old.storage_path
       or new.file_size_bytes is distinct from old.file_size_bytes
       or new.source_image_id is distinct from old.source_image_id
       or new.crop_rect_px is distinct from old.crop_rect_px
       or new.kind is distinct from old.kind
       or new.deleted_at is distinct from old.deleted_at then
      raise exception using
        message = 'master image is immutable',
        detail = format('project_id=%s image_id=%s', old.project_id, old.id),
        hint = 'Only active pointer changes are allowed for master image rows.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."guard_master_immutable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."project_grid_sync_spacing_legacy"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.spacing_x_value is null then
    new.spacing_x_value := new.spacing_value;
  end if;

  if new.spacing_y_value is null then
    new.spacing_y_value := new.spacing_value;
  end if;

  -- `spacing_value` remains the legacy single-axis column. Mirror X to preserve backwards compatibility.
  new.spacing_value := new.spacing_x_value;

  return new;
end
$$;


ALTER FUNCTION "public"."project_grid_sync_spacing_legacy"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."project_workspace_sync_px_cache"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  w_u bigint;
  h_u bigint;
begin
  if tg_op = 'UPDATE' then
    if new.width_px_u is null then new.width_px_u := old.width_px_u; end if;
    if new.height_px_u is null then new.height_px_u := old.height_px_u; end if;
  else
    if new.width_px_u is null or new.height_px_u is null then
      raise exception using
        message = 'project_workspace INSERT requires width_px_u and height_px_u',
        hint = 'Provide canonical micro-pixel geometry explicitly.';
    end if;
  end if;

  w_u := new.width_px_u::bigint;
  h_u := new.height_px_u::bigint;

  new.width_px := greatest(1, ((w_u + 500000) / 1000000)::int);
  new.height_px := greatest(1, ((h_u + 500000) / 1000000)::int);
  return new;
end
$$;


ALTER FUNCTION "public"."project_workspace_sync_px_cache"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_project_image_filter"("p_project_id" "uuid", "p_filter_id" "uuid", "p_rewires" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_target_project uuid;
  v_rewire jsonb;
  v_filter_id uuid;
  v_input uuid;
  v_output uuid;
  v_row record;
  v_next integer := 1;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));

  select project_id
    into v_target_project
  from public.project_image_filters
  where id = p_filter_id;

  if v_target_project is null then
    raise exception 'filter not found' using errcode = 'P0002';
  end if;

  if v_target_project is distinct from p_project_id then
    raise exception 'filter does not belong to project' using errcode = '23503';
  end if;

  for v_rewire in select * from jsonb_array_elements(coalesce(p_rewires, '[]'::jsonb))
  loop
    v_filter_id := (v_rewire ->> 'id')::uuid;
    v_input := (v_rewire ->> 'input_image_id')::uuid;
    v_output := (v_rewire ->> 'output_image_id')::uuid;

    update public.project_image_filters
       set input_image_id = v_input,
           output_image_id = v_output
     where id = v_filter_id
       and project_id = p_project_id;

    if not found then
      raise exception 'rewire target filter % not found in project', v_filter_id
        using errcode = 'P0002';
    end if;
  end loop;

  delete from public.project_image_filters
   where id = p_filter_id
     and project_id = p_project_id;

  for v_row in
    select id, stack_order
    from public.project_image_filters
    where project_id = p_project_id
    order by stack_order asc, created_at asc, id asc
  loop
    if v_row.stack_order is distinct from v_next then
      update public.project_image_filters
         set stack_order = v_next
       where id = v_row.id;
    end if;
    v_next := v_next + 1;
  end loop;
end;
$$;


ALTER FUNCTION "public"."remove_project_image_filter"("p_project_id" "uuid", "p_filter_id" "uuid", "p_rewires" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reorder_project_image_filters"("p_project_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_row record;
  v_next integer := 1;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));

  for v_row in
    select id, stack_order
    from public.project_image_filters
    where project_id = p_project_id
    order by stack_order asc, created_at asc, id asc
  loop
    if v_row.stack_order is distinct from v_next then
      update public.project_image_filters
         set stack_order = v_next
       where id = v_row.id;
    end if;
    v_next := v_next + 1;
  end loop;
end;
$$;


ALTER FUNCTION "public"."reorder_project_image_filters"("p_project_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_active_image"("p_project_id" "uuid", "p_image_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_target_exists boolean;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));

  select exists (
    select 1
    from public.project_images pi
    where pi.id = p_image_id
      and pi.project_id = p_project_id
      and pi.deleted_at is null
  )
  into v_target_exists;

  if not v_target_exists then
    raise exception using
      message = 'set_active_image target not found',
      detail = format('project_id=%s image_id=%s', p_project_id, p_image_id),
      hint = 'Ensure the image belongs to the project and is not deleted.';
  end if;

  update public.project_images
  set is_active = false
  where project_id = p_project_id
    and deleted_at is null;

  update public.project_images
  set is_active = true
  where id = p_image_id
    and project_id = p_project_id
    and deleted_at is null;
end;
$$;


ALTER FUNCTION "public"."set_active_image"("p_project_id" "uuid", "p_image_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_active_master_image"("p_project_id" "uuid", "p_image_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  -- The inner set_active_image takes the same advisory lock; reentrant
  -- in the same transaction. Acquired here too so the wrapper holds the
  -- lock for any of its own future mutations.
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));
  perform public.set_active_image(p_project_id, p_image_id);
end;
$$;


ALTER FUNCTION "public"."set_active_master_image"("p_project_id" "uuid", "p_image_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_active_master_latest"("p_project_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_image_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));

  select id
  into v_image_id
  from public.project_images
  where project_id = p_project_id
    and deleted_at is null
  order by created_at desc
  limit 1;

  if v_image_id is not null then
    perform public.set_active_image(p_project_id, v_image_id);
  end if;
end;
$$;


ALTER FUNCTION "public"."set_active_master_latest"("p_project_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_active_master_with_state"("p_project_id" "uuid", "p_image_id" "uuid", "p_width_px" integer, "p_height_px" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_w_u bigint;
  v_h_u bigint;
  v_artboard_w_u bigint;
  v_artboard_h_u bigint;
begin
  v_w_u := greatest(1, p_width_px)::bigint * 1000000;
  v_h_u := greatest(1, p_height_px)::bigint * 1000000;

  perform public.set_active_image(p_project_id, p_image_id);

  select
    case
      when pw.width_px_u is not null then pw.width_px_u::bigint
      else greatest(1, pw.width_px)::bigint * 1000000
    end,
    case
      when pw.height_px_u is not null then pw.height_px_u::bigint
      else greatest(1, pw.height_px)::bigint * 1000000
    end
  into v_artboard_w_u, v_artboard_h_u
  from public.project_workspace pw
  where pw.project_id = p_project_id;

  if v_artboard_w_u is null then v_artboard_w_u := v_w_u; end if;
  if v_artboard_h_u is null then v_artboard_h_u := v_h_u; end if;

  insert into public.project_image_state (
    project_id,
    role,
    image_id,
    x_px_u,
    y_px_u,
    width_px_u,
    height_px_u,
    rotation_deg
  ) values (
    p_project_id,
    'master',
    p_image_id,
    (v_artboard_w_u / 2)::text,
    (v_artboard_h_u / 2)::text,
    v_w_u::text,
    v_h_u::text,
    0
  )
  on conflict (project_id, role)
  do update
    set image_id = excluded.image_id,
        x_px_u = excluded.x_px_u,
        y_px_u = excluded.y_px_u,
        width_px_u = excluded.width_px_u,
        height_px_u = excluded.height_px_u,
        rotation_deg = excluded.rotation_deg;
end;
$$;


ALTER FUNCTION "public"."set_active_master_with_state"("p_project_id" "uuid", "p_image_id" "uuid", "p_width_px" integer, "p_height_px" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_active_master_with_state"("p_project_id" "uuid", "p_image_id" "uuid", "p_x_px_u" "text", "p_y_px_u" "text", "p_width_px_u" "text", "p_height_px_u" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_x_u bigint;
  v_y_u bigint;
  v_w_u bigint;
  v_h_u bigint;
begin
  perform pg_advisory_xact_lock(hashtext(p_project_id::text));

  v_x_u := p_x_px_u::bigint;
  v_y_u := p_y_px_u::bigint;
  v_w_u := p_width_px_u::bigint;
  v_h_u := p_height_px_u::bigint;

  if v_w_u <= 0 or v_h_u <= 0 then
    raise exception 'initial placement size must be positive';
  end if;

  perform public.set_active_image(p_project_id, p_image_id);

  insert into public.project_image_state (
    project_id,
    role,
    image_id,
    x_px_u,
    y_px_u,
    width_px_u,
    height_px_u,
    rotation_deg
  ) values (
    p_project_id,
    'master',
    p_image_id,
    v_x_u::text,
    v_y_u::text,
    v_w_u::text,
    v_h_u::text,
    0
  )
  on conflict (project_id, image_id)
  do update
    set role = excluded.role,
        x_px_u = excluded.x_px_u,
        y_px_u = excluded.y_px_u,
        width_px_u = excluded.width_px_u,
        height_px_u = excluded.height_px_u,
        rotation_deg = excluded.rotation_deg,
        updated_at = now();
end;
$$;


ALTER FUNCTION "public"."set_active_master_with_state"("p_project_id" "uuid", "p_image_id" "uuid", "p_x_px_u" "text", "p_y_px_u" "text", "p_width_px_u" "text", "p_height_px_u" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."workspace_value_to_px_u"("v" numeric, "u" "public"."measure_unit", "dpi" numeric) RETURNS bigint
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case u
    when 'px' then round(v * 1000000)::bigint
    when 'mm' then round((v * dpi * 1000000) / 25.4)::bigint
    when 'cm' then round(((v * 10) * dpi * 1000000) / 25.4)::bigint
    when 'pt' then round((v * dpi * 1000000) / 72)::bigint
    else null
  end
$$;


ALTER FUNCTION "public"."workspace_value_to_px_u"("v" numeric, "u" "public"."measure_unit", "dpi" numeric) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."project_filter_settings" (
    "project_id" "uuid" NOT NULL,
    "target_cols" integer NOT NULL,
    "target_rows" integer NOT NULL,
    "max_colors" integer NOT NULL,
    "dither" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_filter_settings_max_colors_check" CHECK ((("max_colors" >= 1) AND ("max_colors" <= 1000))),
    CONSTRAINT "project_filter_settings_target_cols_check" CHECK (("target_cols" > 0)),
    CONSTRAINT "project_filter_settings_target_rows_check" CHECK (("target_rows" > 0))
);


ALTER TABLE "public"."project_filter_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_generation" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "cols" integer NOT NULL,
    "rows" integer NOT NULL,
    "palette" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "cell_labels" smallint[] NOT NULL,
    "render_settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_generation_cols_check" CHECK (("cols" > 0)),
    CONSTRAINT "project_generation_labels_len" CHECK ((COALESCE("array_length"("cell_labels", 1), 0) = ("cols" * "rows"))),
    CONSTRAINT "project_generation_rows_check" CHECK (("rows" > 0))
);


ALTER TABLE "public"."project_generation" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_grid" (
    "project_id" "uuid" NOT NULL,
    "color" "text" NOT NULL,
    "spacing_value" numeric NOT NULL,
    "line_width_value" numeric NOT NULL,
    "unit" "public"."measure_unit" DEFAULT 'mm'::"public"."measure_unit" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "spacing_x_value" numeric NOT NULL,
    "spacing_y_value" numeric NOT NULL,
    CONSTRAINT "project_grid_line_width_value_check" CHECK (("line_width_value" > (0)::numeric)),
    CONSTRAINT "project_grid_spacing_value_check" CHECK (("spacing_value" > (0)::numeric)),
    CONSTRAINT "project_grid_spacing_x_positive" CHECK (("spacing_x_value" > (0)::numeric)),
    CONSTRAINT "project_grid_spacing_y_positive" CHECK (("spacing_y_value" > (0)::numeric))
);


ALTER TABLE "public"."project_grid" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_image_filters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "input_image_id" "uuid" NOT NULL,
    "output_image_id" "uuid" NOT NULL,
    "filter_type" "text" NOT NULL,
    "filter_params" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "stack_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_hidden" boolean DEFAULT false NOT NULL,
    CONSTRAINT "project_image_filters_filter_type_ck" CHECK (("filter_type" = ANY (ARRAY['pixelate'::"text", 'lineart'::"text", 'numerate'::"text"]))),
    CONSTRAINT "project_image_filters_input_not_output_ck" CHECK (("input_image_id" <> "output_image_id")),
    CONSTRAINT "project_image_filters_stack_order_check" CHECK (("stack_order" > 0))
);


ALTER TABLE "public"."project_image_filters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_image_state" (
    "project_id" "uuid" NOT NULL,
    "role" "public"."image_role" NOT NULL,
    "x" numeric DEFAULT 0 NOT NULL,
    "y" numeric DEFAULT 0 NOT NULL,
    "scale_x" numeric DEFAULT 1 NOT NULL,
    "scale_y" numeric DEFAULT 1 NOT NULL,
    "width_px" numeric,
    "height_px" numeric,
    "unit" "public"."measure_unit",
    "dpi" numeric,
    "rotation_deg" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "width_px_u" "text" NOT NULL,
    "height_px_u" "text" NOT NULL,
    "x_px_u" "text",
    "y_px_u" "text",
    "image_id" "uuid" NOT NULL,
    CONSTRAINT "project_image_state_dpi_check" CHECK ((("dpi" IS NULL) OR ("dpi" > (0)::numeric))),
    CONSTRAINT "project_image_state_dpi_positive" CHECK ((("dpi" IS NULL) OR ("dpi" > (0)::numeric))),
    CONSTRAINT "project_image_state_height_px_check" CHECK ((("height_px" IS NULL) OR ("height_px" > (0)::numeric))),
    CONSTRAINT "project_image_state_height_px_positive" CHECK ((("height_px" IS NULL) OR ("height_px" > (0)::numeric))),
    CONSTRAINT "project_image_state_scale_x_check" CHECK (("scale_x" > (0)::numeric)),
    CONSTRAINT "project_image_state_scale_y_check" CHECK (("scale_y" > (0)::numeric)),
    CONSTRAINT "project_image_state_width_px_check" CHECK ((("width_px" IS NULL) OR ("width_px" > (0)::numeric))),
    CONSTRAINT "project_image_state_width_px_positive" CHECK ((("width_px" IS NULL) OR ("width_px" > (0)::numeric)))
);


ALTER TABLE "public"."project_image_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "format" "text" NOT NULL,
    "width_px" integer NOT NULL,
    "height_px" integer NOT NULL,
    "bit_depth" integer,
    "storage_path" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "color_space" "public"."color_space",
    "file_size_bytes" bigint DEFAULT 0 NOT NULL,
    "dpi" numeric,
    "storage_bucket" "text" DEFAULT 'project_images'::"text" NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "source_image_id" "uuid",
    "crop_rect_px" "jsonb",
    "is_locked" boolean DEFAULT false NOT NULL,
    "kind" "public"."image_kind" NOT NULL,
    CONSTRAINT "project_images_bit_depth_check" CHECK (("bit_depth" > 0)),
    CONSTRAINT "project_images_crop_rect_number_int_ck" CHECK ((("crop_rect_px" IS NULL) OR (("jsonb_typeof"(("crop_rect_px" -> 'x'::"text")) = 'number'::"text") AND ("jsonb_typeof"(("crop_rect_px" -> 'y'::"text")) = 'number'::"text") AND ("jsonb_typeof"(("crop_rect_px" -> 'w'::"text")) = 'number'::"text") AND ("jsonb_typeof"(("crop_rect_px" -> 'h'::"text")) = 'number'::"text") AND (((("crop_rect_px" ->> 'x'::"text"))::numeric % (1)::numeric) = (0)::numeric) AND (((("crop_rect_px" ->> 'y'::"text"))::numeric % (1)::numeric) = (0)::numeric) AND (((("crop_rect_px" ->> 'w'::"text"))::numeric % (1)::numeric) = (0)::numeric) AND (((("crop_rect_px" ->> 'h'::"text"))::numeric % (1)::numeric) = (0)::numeric)))),
    CONSTRAINT "project_images_crop_rect_requires_source_ck" CHECK ((("crop_rect_px" IS NULL) OR ("source_image_id" IS NOT NULL))),
    CONSTRAINT "project_images_crop_rect_shape_ck" CHECK ((("crop_rect_px" IS NULL) OR (("jsonb_typeof"("crop_rect_px") = 'object'::"text") AND ("crop_rect_px" ?& ARRAY['x'::"text", 'y'::"text", 'w'::"text", 'h'::"text"]) AND ((((("crop_rect_px" - 'x'::"text") - 'y'::"text") - 'w'::"text") - 'h'::"text") = '{}'::"jsonb")))),
    CONSTRAINT "project_images_crop_rect_value_ck" CHECK ((("crop_rect_px" IS NULL) OR (((("crop_rect_px" ->> 'x'::"text"))::integer >= 0) AND ((("crop_rect_px" ->> 'y'::"text"))::integer >= 0) AND ((("crop_rect_px" ->> 'w'::"text"))::integer >= 10) AND ((("crop_rect_px" ->> 'h'::"text"))::integer >= 10)))),
    CONSTRAINT "project_images_file_size_bytes_check" CHECK (("file_size_bytes" >= 0)),
    CONSTRAINT "project_images_height_px_check" CHECK (("height_px" > 0)),
    CONSTRAINT "project_images_master_no_source_kind_ck" CHECK ((("kind" <> 'master'::"public"."image_kind") OR ("source_image_id" IS NULL))),
    CONSTRAINT "project_images_width_px_check" CHECK (("width_px" > 0))
);


ALTER TABLE "public"."project_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_pdfs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "sequence_number" integer NOT NULL,
    "filename" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "pdf_format" "text" NOT NULL,
    "output_dpi_x" numeric NOT NULL,
    "output_dpi_y" numeric NOT NULL,
    "output_line_width_value" numeric NOT NULL,
    "output_line_width_unit" "public"."measure_unit" DEFAULT 'mm'::"public"."measure_unit" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "generation_id" "uuid",
    CONSTRAINT "project_pdfs_output_dpi_x_check" CHECK (("output_dpi_x" > (0)::numeric)),
    CONSTRAINT "project_pdfs_output_dpi_y_check" CHECK (("output_dpi_y" > (0)::numeric)),
    CONSTRAINT "project_pdfs_output_line_width_value_check" CHECK (("output_line_width_value" > (0)::numeric)),
    CONSTRAINT "project_pdfs_sequence_number_check" CHECK (("sequence_number" > 0))
);


ALTER TABLE "public"."project_pdfs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_vectorization_settings" (
    "project_id" "uuid" NOT NULL,
    "num_colors" integer NOT NULL,
    "output_width_px" integer NOT NULL,
    "output_height_px" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_vectorization_settings_num_colors_check" CHECK ((("num_colors" >= 1) AND ("num_colors" <= 1000))),
    CONSTRAINT "project_vectorization_settings_output_height_px_check" CHECK (("output_height_px" > 0)),
    CONSTRAINT "project_vectorization_settings_output_width_px_check" CHECK (("output_width_px" > 0))
);


ALTER TABLE "public"."project_vectorization_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_workspace" (
    "project_id" "uuid" NOT NULL,
    "unit" "public"."measure_unit" DEFAULT 'mm'::"public"."measure_unit" NOT NULL,
    "width_value" numeric NOT NULL,
    "height_value" numeric NOT NULL,
    "width_px" integer NOT NULL,
    "height_px" integer NOT NULL,
    "raster_effects_preset" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "width_px_u" "text" NOT NULL,
    "height_px_u" "text" NOT NULL,
    "page_bg_enabled" boolean DEFAULT false NOT NULL,
    "page_bg_color" "text" DEFAULT '#ffffff'::"text" NOT NULL,
    "page_bg_opacity" integer DEFAULT 50 NOT NULL,
    "output_dpi" numeric DEFAULT 300 NOT NULL,
    CONSTRAINT "project_workspace_height_px_check" CHECK (("height_px" > 0)),
    CONSTRAINT "project_workspace_height_px_u_positive" CHECK (((("height_px_u")::bigint >= 1000000) AND (("height_px_u")::bigint <= '32768000000'::bigint))),
    CONSTRAINT "project_workspace_height_value_check" CHECK (("height_value" > (0)::numeric)),
    CONSTRAINT "project_workspace_output_dpi_positive" CHECK (("output_dpi" > (0)::numeric)),
    CONSTRAINT "project_workspace_page_bg_color_hex" CHECK (("page_bg_color" ~ '^#([0-9a-fA-F]{6})$'::"text")),
    CONSTRAINT "project_workspace_page_bg_opacity_pct" CHECK ((("page_bg_opacity" >= 0) AND ("page_bg_opacity" <= 100))),
    CONSTRAINT "project_workspace_px_cache_consistency" CHECK ((("width_px" = GREATEST(1, (((("width_px_u")::bigint + 500000) / 1000000))::integer)) AND ("height_px" = GREATEST(1, (((("height_px_u")::bigint + 500000) / 1000000))::integer)))),
    CONSTRAINT "project_workspace_raster_effects_preset_check" CHECK ((("raster_effects_preset" IS NULL) OR ("raster_effects_preset" = ANY (ARRAY['high'::"text", 'medium'::"text", 'low'::"text"])))),
    CONSTRAINT "project_workspace_width_px_check" CHECK (("width_px" > 0)),
    CONSTRAINT "project_workspace_width_px_u_positive" CHECK (((("width_px_u")::bigint >= 1000000) AND (("width_px_u")::bigint <= '32768000000'::bigint))),
    CONSTRAINT "project_workspace_width_value_check" CHECK (("width_value" > (0)::numeric))
);


ALTER TABLE "public"."project_workspace" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "status" "public"."project_status" DEFAULT 'in_progress'::"public"."project_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "workflow_step" "public"."workflow_step" DEFAULT 'image'::"public"."workflow_step" NOT NULL
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schema_migrations" (
    "id" bigint NOT NULL,
    "filename" "text" NOT NULL,
    "checksum_sha256" "text" NOT NULL,
    "applied_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."schema_migrations" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."schema_migrations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."schema_migrations_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."schema_migrations_id_seq" OWNED BY "public"."schema_migrations"."id";



ALTER TABLE ONLY "public"."schema_migrations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."schema_migrations_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."project_filter_settings"
    ADD CONSTRAINT "project_filter_settings_pkey" PRIMARY KEY ("project_id");



ALTER TABLE ONLY "public"."project_generation"
    ADD CONSTRAINT "project_generation_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_generation"
    ADD CONSTRAINT "project_generation_project_id_key" UNIQUE ("project_id");



ALTER TABLE ONLY "public"."project_grid"
    ADD CONSTRAINT "project_grid_pkey" PRIMARY KEY ("project_id");



ALTER TABLE ONLY "public"."project_image_filters"
    ADD CONSTRAINT "project_image_filters_output_unique" UNIQUE ("output_image_id");



ALTER TABLE ONLY "public"."project_image_filters"
    ADD CONSTRAINT "project_image_filters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_image_filters"
    ADD CONSTRAINT "project_image_filters_project_stack_order_uidx" UNIQUE ("project_id", "stack_order");



ALTER TABLE ONLY "public"."project_image_state"
    ADD CONSTRAINT "project_image_state_pk" PRIMARY KEY ("project_id", "image_id");



ALTER TABLE "public"."project_images"
    ADD CONSTRAINT "project_images_non_master_requires_source_kind_ck" CHECK ((("kind" = 'master'::"public"."image_kind") OR ("source_image_id" IS NOT NULL))) NOT VALID;



ALTER TABLE ONLY "public"."project_images"
    ADD CONSTRAINT "project_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_pdfs"
    ADD CONSTRAINT "project_pdfs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_pdfs"
    ADD CONSTRAINT "project_pdfs_sequence_unique" UNIQUE ("project_id", "sequence_number");



ALTER TABLE ONLY "public"."project_vectorization_settings"
    ADD CONSTRAINT "project_vectorization_settings_pkey" PRIMARY KEY ("project_id");



ALTER TABLE ONLY "public"."project_workspace"
    ADD CONSTRAINT "project_workspace_pkey" PRIMARY KEY ("project_id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schema_migrations"
    ADD CONSTRAINT "schema_migrations_filename_unique" UNIQUE ("filename");



ALTER TABLE ONLY "public"."schema_migrations"
    ADD CONSTRAINT "schema_migrations_pkey" PRIMARY KEY ("id");



CREATE INDEX "project_image_filters_input_image_idx" ON "public"."project_image_filters" USING "btree" ("input_image_id");



CREATE INDEX "project_image_filters_output_image_idx" ON "public"."project_image_filters" USING "btree" ("output_image_id");



CREATE INDEX "project_image_filters_project_order_idx" ON "public"."project_image_filters" USING "btree" ("project_id", "stack_order");



CREATE INDEX "project_image_state_project_role_image_idx" ON "public"."project_image_state" USING "btree" ("project_id", "role", "image_id");



CREATE UNIQUE INDEX "project_images_active_master_kind_uidx" ON "public"."project_images" USING "btree" ("project_id") WHERE (("is_active" IS TRUE) AND ("deleted_at" IS NULL) AND ("kind" = 'master'::"public"."image_kind"));



CREATE UNIQUE INDEX "project_images_active_working_copy_kind_uidx" ON "public"."project_images" USING "btree" ("project_id") WHERE (("is_active" IS TRUE) AND ("deleted_at" IS NULL) AND ("kind" = 'working_copy'::"public"."image_kind"));



CREATE INDEX "project_images_master_list_active_kind_idx" ON "public"."project_images" USING "btree" ("project_id", "created_at" DESC) WHERE (("kind" = 'master'::"public"."image_kind") AND ("deleted_at" IS NULL));



CREATE UNIQUE INDEX "project_images_one_active_image_idx" ON "public"."project_images" USING "btree" ("project_id") WHERE (("is_active" IS TRUE) AND ("deleted_at" IS NULL));



CREATE INDEX "project_images_project_id_idx" ON "public"."project_images" USING "btree" ("project_id");



CREATE INDEX "project_pdfs_project_id_idx" ON "public"."project_pdfs" USING "btree" ("project_id");



CREATE INDEX "projects_owner_id_idx" ON "public"."projects" USING "btree" ("owner_id");



CREATE INDEX "projects_owner_updated_at_idx" ON "public"."projects" USING "btree" ("owner_id", "updated_at" DESC);



CREATE OR REPLACE TRIGGER "trg_project_filter_settings_updated_at" BEFORE UPDATE ON "public"."project_filter_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_project_generation_updated_at" BEFORE UPDATE ON "public"."project_generation" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_project_grid_sync_spacing_legacy" BEFORE INSERT OR UPDATE ON "public"."project_grid" FOR EACH ROW EXECUTE FUNCTION "public"."project_grid_sync_spacing_legacy"();



CREATE OR REPLACE TRIGGER "trg_project_grid_updated_at" BEFORE UPDATE ON "public"."project_grid" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_project_image_filters_updated_at" BEFORE UPDATE ON "public"."project_image_filters" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_project_image_state_updated_at" BEFORE UPDATE ON "public"."project_image_state" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_project_images_guard_master_immutable" BEFORE DELETE OR UPDATE ON "public"."project_images" FOR EACH ROW EXECUTE FUNCTION "public"."guard_master_immutable"();



CREATE OR REPLACE TRIGGER "trg_project_images_updated_at" BEFORE UPDATE ON "public"."project_images" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_project_vec_updated_at" BEFORE UPDATE ON "public"."project_vectorization_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_project_workspace_sync_px_cache" BEFORE INSERT OR UPDATE ON "public"."project_workspace" FOR EACH ROW EXECUTE FUNCTION "public"."project_workspace_sync_px_cache"();



CREATE OR REPLACE TRIGGER "trg_project_workspace_updated_at" BEFORE UPDATE ON "public"."project_workspace" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_projects_updated_at" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."project_filter_settings"
    ADD CONSTRAINT "project_filter_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_generation"
    ADD CONSTRAINT "project_generation_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_grid"
    ADD CONSTRAINT "project_grid_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_image_filters"
    ADD CONSTRAINT "project_image_filters_input_image_id_fkey" FOREIGN KEY ("input_image_id") REFERENCES "public"."project_images"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."project_image_filters"
    ADD CONSTRAINT "project_image_filters_output_image_id_fkey" FOREIGN KEY ("output_image_id") REFERENCES "public"."project_images"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."project_image_filters"
    ADD CONSTRAINT "project_image_filters_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_image_state"
    ADD CONSTRAINT "project_image_state_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "public"."project_images"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_image_state"
    ADD CONSTRAINT "project_image_state_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_images"
    ADD CONSTRAINT "project_images_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_images"
    ADD CONSTRAINT "project_images_source_image_id_fkey" FOREIGN KEY ("source_image_id") REFERENCES "public"."project_images"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."project_pdfs"
    ADD CONSTRAINT "project_pdfs_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "public"."project_generation"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_pdfs"
    ADD CONSTRAINT "project_pdfs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_vectorization_settings"
    ADD CONSTRAINT "project_vectorization_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_workspace"
    ADD CONSTRAINT "project_workspace_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."project_filter_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_filter_settings_owner_all" ON "public"."project_filter_settings" USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"())))) WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



ALTER TABLE "public"."project_generation" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_generation_owner_all" ON "public"."project_generation" USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"())))) WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



ALTER TABLE "public"."project_grid" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_grid_owner_all" ON "public"."project_grid" USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"())))) WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



ALTER TABLE "public"."project_image_filters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_image_filters_owner_delete" ON "public"."project_image_filters" FOR DELETE USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_image_filters_owner_insert" ON "public"."project_image_filters" FOR INSERT WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_image_filters_owner_select" ON "public"."project_image_filters" FOR SELECT USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_image_filters_owner_update" ON "public"."project_image_filters" FOR UPDATE USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"())))) WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



ALTER TABLE "public"."project_image_state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_image_state_owner_all" ON "public"."project_image_state" USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"())))) WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



ALTER TABLE "public"."project_images" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_images_delete_owner" ON "public"."project_images" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_images"."project_id") AND ("p"."owner_id" = "auth"."uid"())))));



CREATE POLICY "project_images_insert_owner" ON "public"."project_images" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_images"."project_id") AND ("p"."owner_id" = "auth"."uid"())))));



CREATE POLICY "project_images_owner_delete_non_master" ON "public"."project_images" FOR DELETE USING ((("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))) AND ("kind" <> 'master'::"public"."image_kind")));



CREATE POLICY "project_images_owner_insert" ON "public"."project_images" FOR INSERT WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_images_owner_select" ON "public"."project_images" FOR SELECT USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_images_owner_update" ON "public"."project_images" FOR UPDATE USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"())))) WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_images_select_owner" ON "public"."project_images" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_images"."project_id") AND ("p"."owner_id" = "auth"."uid"())))));



CREATE POLICY "project_images_update_owner" ON "public"."project_images" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_images"."project_id") AND ("p"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_images"."project_id") AND ("p"."owner_id" = "auth"."uid"())))));



ALTER TABLE "public"."project_pdfs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_pdfs_owner_all" ON "public"."project_pdfs" USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"())))) WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_vec_owner_all" ON "public"."project_vectorization_settings" USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"())))) WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



ALTER TABLE "public"."project_vectorization_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_workspace" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_workspace_owner_all" ON "public"."project_workspace" USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"())))) WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "projects_delete_owner" ON "public"."projects" FOR DELETE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "projects_insert_owner" ON "public"."projects" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "projects_select_owner" ON "public"."projects" FOR SELECT USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "projects_update_owner" ON "public"."projects" FOR UPDATE USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."schema_migrations" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";































































































































































GRANT ALL ON FUNCTION "public"."append_project_image_filter"("p_project_id" "uuid", "p_input_image_id" "uuid", "p_output_image_id" "uuid", "p_filter_type" "text", "p_filter_params" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."append_project_image_filter"("p_project_id" "uuid", "p_input_image_id" "uuid", "p_output_image_id" "uuid", "p_filter_type" "text", "p_filter_params" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."append_project_image_filter"("p_project_id" "uuid", "p_input_image_id" "uuid", "p_output_image_id" "uuid", "p_filter_type" "text", "p_filter_params" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_project"("p_project_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_project"("p_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_project"("p_project_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_master_immutable"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_master_immutable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_master_immutable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."project_grid_sync_spacing_legacy"() TO "anon";
GRANT ALL ON FUNCTION "public"."project_grid_sync_spacing_legacy"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."project_grid_sync_spacing_legacy"() TO "service_role";



GRANT ALL ON FUNCTION "public"."project_workspace_sync_px_cache"() TO "anon";
GRANT ALL ON FUNCTION "public"."project_workspace_sync_px_cache"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."project_workspace_sync_px_cache"() TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_project_image_filter"("p_project_id" "uuid", "p_filter_id" "uuid", "p_rewires" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_project_image_filter"("p_project_id" "uuid", "p_filter_id" "uuid", "p_rewires" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_project_image_filter"("p_project_id" "uuid", "p_filter_id" "uuid", "p_rewires" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."reorder_project_image_filters"("p_project_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reorder_project_image_filters"("p_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reorder_project_image_filters"("p_project_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_active_image"("p_project_id" "uuid", "p_image_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_active_image"("p_project_id" "uuid", "p_image_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_active_image"("p_project_id" "uuid", "p_image_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_active_master_image"("p_project_id" "uuid", "p_image_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_active_master_image"("p_project_id" "uuid", "p_image_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_active_master_image"("p_project_id" "uuid", "p_image_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_active_master_latest"("p_project_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_active_master_latest"("p_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_active_master_latest"("p_project_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_active_master_with_state"("p_project_id" "uuid", "p_image_id" "uuid", "p_width_px" integer, "p_height_px" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."set_active_master_with_state"("p_project_id" "uuid", "p_image_id" "uuid", "p_width_px" integer, "p_height_px" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_active_master_with_state"("p_project_id" "uuid", "p_image_id" "uuid", "p_width_px" integer, "p_height_px" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_active_master_with_state"("p_project_id" "uuid", "p_image_id" "uuid", "p_x_px_u" "text", "p_y_px_u" "text", "p_width_px_u" "text", "p_height_px_u" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_active_master_with_state"("p_project_id" "uuid", "p_image_id" "uuid", "p_x_px_u" "text", "p_y_px_u" "text", "p_width_px_u" "text", "p_height_px_u" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_active_master_with_state"("p_project_id" "uuid", "p_image_id" "uuid", "p_x_px_u" "text", "p_y_px_u" "text", "p_width_px_u" "text", "p_height_px_u" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."workspace_value_to_px_u"("v" numeric, "u" "public"."measure_unit", "dpi" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."workspace_value_to_px_u"("v" numeric, "u" "public"."measure_unit", "dpi" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."workspace_value_to_px_u"("v" numeric, "u" "public"."measure_unit", "dpi" numeric) TO "service_role";


















GRANT ALL ON TABLE "public"."project_filter_settings" TO "anon";
GRANT ALL ON TABLE "public"."project_filter_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."project_filter_settings" TO "service_role";



GRANT ALL ON TABLE "public"."project_generation" TO "anon";
GRANT ALL ON TABLE "public"."project_generation" TO "authenticated";
GRANT ALL ON TABLE "public"."project_generation" TO "service_role";



GRANT ALL ON TABLE "public"."project_grid" TO "anon";
GRANT ALL ON TABLE "public"."project_grid" TO "authenticated";
GRANT ALL ON TABLE "public"."project_grid" TO "service_role";



GRANT ALL ON TABLE "public"."project_image_filters" TO "anon";
GRANT ALL ON TABLE "public"."project_image_filters" TO "authenticated";
GRANT ALL ON TABLE "public"."project_image_filters" TO "service_role";



GRANT ALL ON TABLE "public"."project_image_state" TO "anon";
GRANT ALL ON TABLE "public"."project_image_state" TO "authenticated";
GRANT ALL ON TABLE "public"."project_image_state" TO "service_role";



GRANT ALL ON TABLE "public"."project_images" TO "anon";
GRANT ALL ON TABLE "public"."project_images" TO "authenticated";
GRANT ALL ON TABLE "public"."project_images" TO "service_role";



GRANT ALL ON TABLE "public"."project_pdfs" TO "anon";
GRANT ALL ON TABLE "public"."project_pdfs" TO "authenticated";
GRANT ALL ON TABLE "public"."project_pdfs" TO "service_role";



GRANT ALL ON TABLE "public"."project_vectorization_settings" TO "anon";
GRANT ALL ON TABLE "public"."project_vectorization_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."project_vectorization_settings" TO "service_role";



GRANT ALL ON TABLE "public"."project_workspace" TO "anon";
GRANT ALL ON TABLE "public"."project_workspace" TO "authenticated";
GRANT ALL ON TABLE "public"."project_workspace" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."schema_migrations" TO "anon";
GRANT ALL ON TABLE "public"."schema_migrations" TO "authenticated";
GRANT ALL ON TABLE "public"."schema_migrations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."schema_migrations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."schema_migrations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."schema_migrations_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































--
-- Dumped schema changes for auth and storage
--


-- =========================================================
-- Storage-Policies (preserved from squashed migration
-- 20260204231346_project_images_multi.sql)
-- =========================================================
-- Rationale: storage.objects is owned by supabase_storage_admin.
-- ALTER TABLE / CREATE POLICY on it fails locally with 42501.
-- The DO-block catches insufficient_privilege so local supabase
-- boot doesn't halt; production has the policies via privileged path.

-- gruf.io - Storage policy update for project image object paths.
-- NOTE:
-- - Legacy filename retained for migration-history compatibility.
-- - This migration only updates `storage.objects` RLS policies (no `public.project_images` DDL).
-- - Path convention: projects/<project_id>/images/<image_id>
-- - Must be executed by the owner of storage.objects (supabase_storage_admin).
--
-- Why the DO-block wrapper: `storage.objects` is owned by
-- `supabase_storage_admin`, and the local `supabase start` migration
-- runner is neither that role nor a superuser. ALTER TABLE / CREATE
-- POLICY on storage.objects therefore fails locally with 42501. In
-- production the migration runs via a privileged path. We catch
-- `insufficient_privilege` so the local replay surfaces the policies
-- as a no-op (production already has them) instead of halting the
-- whole DB bring-up. The integration tests we run against the local
-- DB do not touch storage RLS, so a skipped policy here is harmless.

do $$
begin
  execute 'alter table storage.objects enable row level security';

  execute 'drop policy if exists project_images_storage_select_owner on storage.objects';
  execute $sql$
    create policy project_images_storage_select_owner
    on storage.objects for select
    using (
      bucket_id = 'project_images'
      and (
        name ~ '^projects/[0-9a-fA-F-]{36}/images/[0-9a-fA-F-]{36}$'
        or name ~ '^projects/[0-9a-fA-F-]{36}/(master|working)/'
      )
      and exists (
        select 1
        from public.projects p
        where p.id::text = substring(storage.objects.name from '^projects/([0-9a-fA-F-]{36})/')
          and p.owner_id = auth.uid()
      )
    )
  $sql$;

  execute 'drop policy if exists project_images_storage_insert_owner on storage.objects';
  execute $sql$
    create policy project_images_storage_insert_owner
    on storage.objects for insert
    with check (
      bucket_id = 'project_images'
      and (
        name ~ '^projects/[0-9a-fA-F-]{36}/images/[0-9a-fA-F-]{36}$'
        or name ~ '^projects/[0-9a-fA-F-]{36}/(master|working)/'
      )
      and exists (
        select 1
        from public.projects p
        where p.id::text = substring(storage.objects.name from '^projects/([0-9a-fA-F-]{36})/')
          and p.owner_id = auth.uid()
      )
    )
  $sql$;

  execute 'drop policy if exists project_images_storage_update_owner on storage.objects';
  execute $sql$
    create policy project_images_storage_update_owner
    on storage.objects for update
    using (
      bucket_id = 'project_images'
      and (
        name ~ '^projects/[0-9a-fA-F-]{36}/images/[0-9a-fA-F-]{36}$'
        or name ~ '^projects/[0-9a-fA-F-]{36}/(master|working)/'
      )
      and exists (
        select 1
        from public.projects p
        where p.id::text = substring(storage.objects.name from '^projects/([0-9a-fA-F-]{36})/')
          and p.owner_id = auth.uid()
      )
    )
    with check (
      bucket_id = 'project_images'
      and (
        name ~ '^projects/[0-9a-fA-F-]{36}/images/[0-9a-fA-F-]{36}$'
        or name ~ '^projects/[0-9a-fA-F-]{36}/(master|working)/'
      )
      and exists (
        select 1
        from public.projects p
        where p.id::text = substring(storage.objects.name from '^projects/([0-9a-fA-F-]{36})/')
          and p.owner_id = auth.uid()
      )
    )
  $sql$;

  execute 'drop policy if exists project_images_storage_delete_owner on storage.objects';
  execute $sql$
    create policy project_images_storage_delete_owner
    on storage.objects for delete
    using (
      bucket_id = 'project_images'
      and (
        name ~ '^projects/[0-9a-fA-F-]{36}/images/[0-9a-fA-F-]{36}$'
        or name ~ '^projects/[0-9a-fA-F-]{36}/(master|working)/'
      )
      and exists (
        select 1
        from public.projects p
        where p.id::text = substring(storage.objects.name from '^projects/([0-9a-fA-F-]{36})/')
          and p.owner_id = auth.uid()
      )
    )
  $sql$;
exception
  when insufficient_privilege then
    raise notice
      'skipping storage.objects RLS — current role lacks ownership; production applies these via a privileged path';
end $$;
