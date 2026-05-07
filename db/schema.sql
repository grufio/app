


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


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE SCHEMA IF NOT EXISTS "storage";


ALTER SCHEMA "storage" OWNER TO "supabase_admin";


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


CREATE TYPE "storage"."buckettype" AS ENUM (
    'STANDARD',
    'ANALYTICS',
    'VECTOR'
);


ALTER TYPE "storage"."buckettype" OWNER TO "supabase_storage_admin";


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


CREATE OR REPLACE FUNCTION "public"."collect_project_image_delete_targets"("p_project_id" "uuid", "p_root_image_id" "uuid") RETURNS TABLE("id" "uuid", "storage_bucket" "text", "storage_path" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with recursive lineage as (
    select pi.id
    from public.project_images pi
    where pi.project_id = p_project_id
      and pi.id = p_root_image_id
      and pi.deleted_at is null

    union all

    select child.id
    from public.project_images child
    join lineage parent on child.source_image_id = parent.id
    where child.project_id = p_project_id
      and child.deleted_at is null
  )
  select pi.id, pi.storage_bucket, pi.storage_path
  from public.project_images pi
  join lineage l on l.id = pi.id
  where pi.project_id = p_project_id
    and pi.deleted_at is null;
$$;


ALTER FUNCTION "public"."collect_project_image_delete_targets"("p_project_id" "uuid", "p_root_image_id" "uuid") OWNER TO "postgres";


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
    SET "search_path" TO 'public', 'pg_temp'
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


CREATE OR REPLACE FUNCTION "storage"."allow_any_operation"("expected_operations" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT CASE
      WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
      ELSE raw_operation
    END AS current_operation
    FROM current_operation
  )
  SELECT EXISTS (
    SELECT 1
    FROM normalized n
    CROSS JOIN LATERAL unnest(expected_operations) AS expected_operation
    WHERE expected_operation IS NOT NULL
      AND expected_operation <> ''
      AND n.current_operation = CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END
  );
$$;


ALTER FUNCTION "storage"."allow_any_operation"("expected_operations" "text"[]) OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."allow_only_operation"("expected_operation" "text") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT
      CASE
        WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
        ELSE raw_operation
      END AS current_operation,
      CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END AS requested_operation
    FROM current_operation
  )
  SELECT CASE
    WHEN requested_operation IS NULL OR requested_operation = '' THEN FALSE
    ELSE COALESCE(current_operation = requested_operation, FALSE)
  END
  FROM normalized;
$$;


ALTER FUNCTION "storage"."allow_only_operation"("expected_operation" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."can_insert_object"("bucketid" "text", "name" "text", "owner" "uuid", "metadata" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$$;


ALTER FUNCTION "storage"."can_insert_object"("bucketid" "text", "name" "text", "owner" "uuid", "metadata" "jsonb") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."enforce_bucket_name_length"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$$;


ALTER FUNCTION "storage"."enforce_bucket_name_length"() OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."extension"("name" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
    _parts text[];
    _filename text;
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Get the last path segment (the actual filename)
    SELECT _parts[array_length(_parts, 1)] INTO _filename;
    -- Extract extension: reverse, split on '.', then reverse again
    RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$$;


ALTER FUNCTION "storage"."extension"("name" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."filename"("name" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[array_length(_parts,1)];
END
$$;


ALTER FUNCTION "storage"."filename"("name" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."foldername"("name" "text") RETURNS "text"[]
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$$;


ALTER FUNCTION "storage"."foldername"("name" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."get_common_prefix"("p_key" "text", "p_prefix" "text", "p_delimiter" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
SELECT CASE
    WHEN position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)) > 0
    THEN left(p_key, length(p_prefix) + position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)))
    ELSE NULL
END;
$$;


ALTER FUNCTION "storage"."get_common_prefix"("p_key" "text", "p_prefix" "text", "p_delimiter" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."get_size_by_bucket"() RETURNS TABLE("size" bigint, "bucket_id" "text")
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
    return query
        select sum((metadata->>'size')::bigint)::bigint as size, obj.bucket_id
        from "storage".objects as obj
        group by obj.bucket_id;
END
$$;


ALTER FUNCTION "storage"."get_size_by_bucket"() OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."list_multipart_uploads_with_delimiter"("bucket_id" "text", "prefix_param" "text", "delimiter_param" "text", "max_keys" integer DEFAULT 100, "next_key_token" "text" DEFAULT ''::"text", "next_upload_token" "text" DEFAULT ''::"text") RETURNS TABLE("key" "text", "id" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $_$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(key COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                        substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1)))
                    ELSE
                        key
                END AS key, id, created_at
            FROM
                storage.s3_multipart_uploads
            WHERE
                bucket_id = $5 AND
                key ILIKE $1 || ''%'' AND
                CASE
                    WHEN $4 != '''' AND $6 = '''' THEN
                        CASE
                            WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                                substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                key COLLATE "C" > $4
                            END
                    ELSE
                        true
                END AND
                CASE
                    WHEN $6 != '''' THEN
                        id COLLATE "C" > $6
                    ELSE
                        true
                    END
            ORDER BY
                key COLLATE "C" ASC, created_at ASC) as e order by key COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_key_token, bucket_id, next_upload_token;
END;
$_$;


ALTER FUNCTION "storage"."list_multipart_uploads_with_delimiter"("bucket_id" "text", "prefix_param" "text", "delimiter_param" "text", "max_keys" integer, "next_key_token" "text", "next_upload_token" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."list_objects_with_delimiter"("_bucket_id" "text", "prefix_param" "text", "delimiter_param" "text", "max_keys" integer DEFAULT 100, "start_after" "text" DEFAULT ''::"text", "next_token" "text" DEFAULT ''::"text", "sort_order" "text" DEFAULT 'asc'::"text") RETURNS TABLE("name" "text", "id" "uuid", "metadata" "jsonb", "updated_at" timestamp with time zone, "created_at" timestamp with time zone, "last_accessed_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;

    -- Configuration
    v_is_asc BOOLEAN;
    v_prefix TEXT;
    v_start TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_is_asc := lower(coalesce(sort_order, 'asc')) = 'asc';
    v_prefix := coalesce(prefix_param, '');
    v_start := CASE WHEN coalesce(next_token, '') <> '' THEN next_token ELSE coalesce(start_after, '') END;
    v_file_batch_size := LEAST(GREATEST(max_keys * 2, 100), 1000);

    -- Calculate upper bound for prefix filtering (bytewise, using COLLATE "C")
    IF v_prefix = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix, 1) = delimiter_param THEN
        v_upper_bound := left(v_prefix, -1) || chr(ascii(delimiter_param) + 1);
    ELSE
        v_upper_bound := left(v_prefix, -1) || chr(ascii(right(v_prefix, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'AND o.name COLLATE "C" < $3 ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'AND o.name COLLATE "C" >= $3 ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- ========================================================================
    -- SEEK INITIALIZATION: Determine starting position
    -- ========================================================================
    IF v_start = '' THEN
        IF v_is_asc THEN
            v_next_seek := v_prefix;
        ELSE
            -- DESC without cursor: find the last item in range
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;

            IF v_next_seek IS NOT NULL THEN
                v_next_seek := v_next_seek || delimiter_param;
            ELSE
                RETURN;
            END IF;
        END IF;
    ELSE
        -- Cursor provided: determine if it refers to a folder or leaf
        IF EXISTS (
            SELECT 1 FROM storage.objects o
            WHERE o.bucket_id = _bucket_id
              AND o.name COLLATE "C" LIKE v_start || delimiter_param || '%'
            LIMIT 1
        ) THEN
            -- Cursor refers to a folder
            IF v_is_asc THEN
                v_next_seek := v_start || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_start || delimiter_param;
            END IF;
        ELSE
            -- Cursor refers to a leaf object
            IF v_is_asc THEN
                v_next_seek := v_start || delimiter_param;
            ELSE
                v_next_seek := v_start;
            END IF;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= max_keys;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(v_peek_name, v_prefix, delimiter_param);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Emit and skip to next folder (no heap access needed)
            name := rtrim(v_common_prefix, delimiter_param);
            id := NULL;
            updated_at := NULL;
            created_at := NULL;
            last_accessed_at := NULL;
            metadata := NULL;
            RETURN NEXT;
            v_count := v_count + 1;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := left(v_common_prefix, -1) || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_common_prefix;
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query USING _bucket_id, v_next_seek,
                CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix) ELSE v_prefix END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(v_current.name, v_prefix, delimiter_param);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := v_current.name;
                    EXIT;
                END IF;

                -- Emit file
                name := v_current.name;
                id := v_current.id;
                updated_at := v_current.updated_at;
                created_at := v_current.created_at;
                last_accessed_at := v_current.last_accessed_at;
                metadata := v_current.metadata;
                RETURN NEXT;
                v_count := v_count + 1;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := v_current.name || delimiter_param;
                ELSE
                    v_next_seek := v_current.name;
                END IF;

                EXIT WHEN v_count >= max_keys;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


ALTER FUNCTION "storage"."list_objects_with_delimiter"("_bucket_id" "text", "prefix_param" "text", "delimiter_param" "text", "max_keys" integer, "start_after" "text", "next_token" "text", "sort_order" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."operation"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$$;


ALTER FUNCTION "storage"."operation"() OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."protect_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$$;


ALTER FUNCTION "storage"."protect_delete"() OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."search"("prefix" "text", "bucketname" "text", "limits" integer DEFAULT 100, "levels" integer DEFAULT 1, "offsets" integer DEFAULT 0, "search" "text" DEFAULT ''::"text", "sortcolumn" "text" DEFAULT 'name'::"text", "sortorder" "text" DEFAULT 'asc'::"text") RETURNS TABLE("name" "text", "id" "uuid", "updated_at" timestamp with time zone, "created_at" timestamp with time zone, "last_accessed_at" timestamp with time zone, "metadata" "jsonb")
    LANGUAGE "plpgsql" STABLE
    AS $_$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;
    v_delimiter CONSTANT TEXT := '/';

    -- Configuration
    v_limit INT;
    v_prefix TEXT;
    v_prefix_lower TEXT;
    v_is_asc BOOLEAN;
    v_order_by TEXT;
    v_sort_order TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;
    v_skipped INT := 0;
BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_limit := LEAST(coalesce(limits, 100), 1500);
    v_prefix := coalesce(prefix, '') || coalesce(search, '');
    v_prefix_lower := lower(v_prefix);
    v_is_asc := lower(coalesce(sortorder, 'asc')) = 'asc';
    v_file_batch_size := LEAST(GREATEST(v_limit * 2, 100), 1000);

    -- Validate sort column
    CASE lower(coalesce(sortcolumn, 'name'))
        WHEN 'name' THEN v_order_by := 'name';
        WHEN 'updated_at' THEN v_order_by := 'updated_at';
        WHEN 'created_at' THEN v_order_by := 'created_at';
        WHEN 'last_accessed_at' THEN v_order_by := 'last_accessed_at';
        ELSE v_order_by := 'name';
    END CASE;

    v_sort_order := CASE WHEN v_is_asc THEN 'asc' ELSE 'desc' END;

    -- ========================================================================
    -- NON-NAME SORTING: Use path_tokens approach (unchanged)
    -- ========================================================================
    IF v_order_by != 'name' THEN
        RETURN QUERY EXECUTE format(
            $sql$
            WITH folders AS (
                SELECT path_tokens[$1] AS folder
                FROM storage.objects
                WHERE objects.name ILIKE $2 || '%%'
                  AND bucket_id = $3
                  AND array_length(objects.path_tokens, 1) <> $1
                GROUP BY folder
                ORDER BY folder %s
            )
            (SELECT folder AS "name",
                   NULL::uuid AS id,
                   NULL::timestamptz AS updated_at,
                   NULL::timestamptz AS created_at,
                   NULL::timestamptz AS last_accessed_at,
                   NULL::jsonb AS metadata FROM folders)
            UNION ALL
            (SELECT path_tokens[$1] AS "name",
                   id, updated_at, created_at, last_accessed_at, metadata
             FROM storage.objects
             WHERE objects.name ILIKE $2 || '%%'
               AND bucket_id = $3
               AND array_length(objects.path_tokens, 1) = $1
             ORDER BY %I %s)
            LIMIT $4 OFFSET $5
            $sql$, v_sort_order, v_order_by, v_sort_order
        ) USING levels, v_prefix, bucketname, v_limit, offsets;
        RETURN;
    END IF;

    -- ========================================================================
    -- NAME SORTING: Hybrid skip-scan with batch optimization
    -- ========================================================================

    -- Calculate upper bound for prefix filtering
    IF v_prefix_lower = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix_lower, 1) = v_delimiter THEN
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(v_delimiter) + 1);
    ELSE
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(right(v_prefix_lower, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'AND lower(o.name) COLLATE "C" < $3 ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'AND lower(o.name) COLLATE "C" >= $3 ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- Initialize seek position
    IF v_is_asc THEN
        v_next_seek := v_prefix_lower;
    ELSE
        -- DESC: find the last item in range first (static SQL)
        IF v_upper_bound IS NOT NULL THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower AND lower(o.name) COLLATE "C" < v_upper_bound
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSIF v_prefix_lower <> '' THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSE
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        END IF;

        IF v_peek_name IS NOT NULL THEN
            v_next_seek := lower(v_peek_name) || v_delimiter;
        ELSE
            RETURN;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= v_limit;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix_lower <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(lower(v_peek_name), v_prefix_lower, v_delimiter);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Handle offset, emit if needed, skip to next folder
            IF v_skipped < offsets THEN
                v_skipped := v_skipped + 1;
            ELSE
                name := split_part(rtrim(storage.get_common_prefix(v_peek_name, v_prefix, v_delimiter), v_delimiter), v_delimiter, levels);
                id := NULL;
                updated_at := NULL;
                created_at := NULL;
                last_accessed_at := NULL;
                metadata := NULL;
                RETURN NEXT;
                v_count := v_count + 1;
            END IF;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := lower(left(v_common_prefix, -1)) || chr(ascii(v_delimiter) + 1);
            ELSE
                v_next_seek := lower(v_common_prefix);
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix_lower is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query
                USING bucketname, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix_lower) ELSE v_prefix_lower END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(lower(v_current.name), v_prefix_lower, v_delimiter);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := lower(v_current.name);
                    EXIT;
                END IF;

                -- Handle offset skipping
                IF v_skipped < offsets THEN
                    v_skipped := v_skipped + 1;
                ELSE
                    -- Emit file
                    name := split_part(v_current.name, v_delimiter, levels);
                    id := v_current.id;
                    updated_at := v_current.updated_at;
                    created_at := v_current.created_at;
                    last_accessed_at := v_current.last_accessed_at;
                    metadata := v_current.metadata;
                    RETURN NEXT;
                    v_count := v_count + 1;
                END IF;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := lower(v_current.name) || v_delimiter;
                ELSE
                    v_next_seek := lower(v_current.name);
                END IF;

                EXIT WHEN v_count >= v_limit;
            END LOOP;
        END IF;
    END LOOP;
END;
$_$;


ALTER FUNCTION "storage"."search"("prefix" "text", "bucketname" "text", "limits" integer, "levels" integer, "offsets" integer, "search" "text", "sortcolumn" "text", "sortorder" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."search_by_timestamp"("p_prefix" "text", "p_bucket_id" "text", "p_limit" integer, "p_level" integer, "p_start_after" "text", "p_sort_order" "text", "p_sort_column" "text", "p_sort_column_after" "text") RETURNS TABLE("key" "text", "name" "text", "id" "uuid", "updated_at" timestamp with time zone, "created_at" timestamp with time zone, "last_accessed_at" timestamp with time zone, "metadata" "jsonb")
    LANGUAGE "plpgsql" STABLE
    AS $_$
DECLARE
    v_cursor_op text;
    v_query text;
    v_prefix text;
BEGIN
    v_prefix := coalesce(p_prefix, '');

    IF p_sort_order = 'asc' THEN
        v_cursor_op := '>';
    ELSE
        v_cursor_op := '<';
    END IF;

    v_query := format($sql$
        WITH raw_objects AS (
            SELECT
                o.name AS obj_name,
                o.id AS obj_id,
                o.updated_at AS obj_updated_at,
                o.created_at AS obj_created_at,
                o.last_accessed_at AS obj_last_accessed_at,
                o.metadata AS obj_metadata,
                storage.get_common_prefix(o.name, $1, '/') AS common_prefix
            FROM storage.objects o
            WHERE o.bucket_id = $2
              AND o.name COLLATE "C" LIKE $1 || '%%'
        ),
        -- Aggregate common prefixes (folders)
        -- Both created_at and updated_at use MIN(obj_created_at) to match the old prefixes table behavior
        aggregated_prefixes AS (
            SELECT
                rtrim(common_prefix, '/') AS name,
                NULL::uuid AS id,
                MIN(obj_created_at) AS updated_at,
                MIN(obj_created_at) AS created_at,
                NULL::timestamptz AS last_accessed_at,
                NULL::jsonb AS metadata,
                TRUE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NOT NULL
            GROUP BY common_prefix
        ),
        leaf_objects AS (
            SELECT
                obj_name AS name,
                obj_id AS id,
                obj_updated_at AS updated_at,
                obj_created_at AS created_at,
                obj_last_accessed_at AS last_accessed_at,
                obj_metadata AS metadata,
                FALSE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NULL
        ),
        combined AS (
            SELECT * FROM aggregated_prefixes
            UNION ALL
            SELECT * FROM leaf_objects
        ),
        filtered AS (
            SELECT *
            FROM combined
            WHERE (
                $5 = ''
                OR ROW(
                    date_trunc('milliseconds', %I),
                    name COLLATE "C"
                ) %s ROW(
                    COALESCE(NULLIF($6, '')::timestamptz, 'epoch'::timestamptz),
                    $5
                )
            )
        )
        SELECT
            split_part(name, '/', $3) AS key,
            name,
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
        FROM filtered
        ORDER BY
            COALESCE(date_trunc('milliseconds', %I), 'epoch'::timestamptz) %s,
            name COLLATE "C" %s
        LIMIT $4
    $sql$,
        p_sort_column,
        v_cursor_op,
        p_sort_column,
        p_sort_order,
        p_sort_order
    );

    RETURN QUERY EXECUTE v_query
    USING v_prefix, p_bucket_id, p_level, p_limit, p_start_after, p_sort_column_after;
END;
$_$;


ALTER FUNCTION "storage"."search_by_timestamp"("p_prefix" "text", "p_bucket_id" "text", "p_limit" integer, "p_level" integer, "p_start_after" "text", "p_sort_order" "text", "p_sort_column" "text", "p_sort_column_after" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."search_v2"("prefix" "text", "bucket_name" "text", "limits" integer DEFAULT 100, "levels" integer DEFAULT 1, "start_after" "text" DEFAULT ''::"text", "sort_order" "text" DEFAULT 'asc'::"text", "sort_column" "text" DEFAULT 'name'::"text", "sort_column_after" "text" DEFAULT ''::"text") RETURNS TABLE("key" "text", "name" "text", "id" "uuid", "updated_at" timestamp with time zone, "created_at" timestamp with time zone, "last_accessed_at" timestamp with time zone, "metadata" "jsonb")
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
    v_sort_col text;
    v_sort_ord text;
    v_limit int;
BEGIN
    -- Cap limit to maximum of 1500 records
    v_limit := LEAST(coalesce(limits, 100), 1500);

    -- Validate and normalize sort_order
    v_sort_ord := lower(coalesce(sort_order, 'asc'));
    IF v_sort_ord NOT IN ('asc', 'desc') THEN
        v_sort_ord := 'asc';
    END IF;

    -- Validate and normalize sort_column
    v_sort_col := lower(coalesce(sort_column, 'name'));
    IF v_sort_col NOT IN ('name', 'updated_at', 'created_at') THEN
        v_sort_col := 'name';
    END IF;

    -- Route to appropriate implementation
    IF v_sort_col = 'name' THEN
        -- Use list_objects_with_delimiter for name sorting (most efficient: O(k * log n))
        RETURN QUERY
        SELECT
            split_part(l.name, '/', levels) AS key,
            l.name AS name,
            l.id,
            l.updated_at,
            l.created_at,
            l.last_accessed_at,
            l.metadata
        FROM storage.list_objects_with_delimiter(
            bucket_name,
            coalesce(prefix, ''),
            '/',
            v_limit,
            start_after,
            '',
            v_sort_ord
        ) l;
    ELSE
        -- Use aggregation approach for timestamp sorting
        -- Not efficient for large datasets but supports correct pagination
        RETURN QUERY SELECT * FROM storage.search_by_timestamp(
            prefix, bucket_name, v_limit, levels, start_after,
            v_sort_ord, v_sort_col, sort_column_after
        );
    END IF;
END;
$$;


ALTER FUNCTION "storage"."search_v2"("prefix" "text", "bucket_name" "text", "limits" integer, "levels" integer, "start_after" "text", "sort_order" "text", "sort_column" "text", "sort_column_after" "text") OWNER TO "supabase_storage_admin";


CREATE OR REPLACE FUNCTION "storage"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$$;


ALTER FUNCTION "storage"."update_updated_at_column"() OWNER TO "supabase_storage_admin";

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
    "spacing_x_value" numeric,
    "spacing_y_value" numeric,
    CONSTRAINT "project_grid_line_width_value_check" CHECK (("line_width_value" > (0)::numeric)),
    CONSTRAINT "project_grid_spacing_value_check" CHECK (("spacing_value" > (0)::numeric)),
    CONSTRAINT "project_grid_spacing_x_positive" CHECK ((("spacing_x_value" IS NULL) OR ("spacing_x_value" > (0)::numeric))),
    CONSTRAINT "project_grid_spacing_y_positive" CHECK ((("spacing_y_value" IS NULL) OR ("spacing_y_value" > (0)::numeric)))
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
    "rotation_deg" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "width_px" numeric,
    "height_px" numeric,
    "unit" "public"."measure_unit",
    "dpi" numeric,
    "width_px_u" "text",
    "height_px_u" "text",
    "x_px_u" "text",
    "y_px_u" "text",
    "image_id" "uuid" NOT NULL,
    CONSTRAINT "project_image_state_dpi_positive" CHECK ((("dpi" IS NULL) OR ("dpi" > (0)::numeric))),
    CONSTRAINT "project_image_state_height_px_positive" CHECK ((("height_px" IS NULL) OR ("height_px" > (0)::numeric))),
    CONSTRAINT "project_image_state_scale_x_check" CHECK (("scale_x" > (0)::numeric)),
    CONSTRAINT "project_image_state_scale_y_check" CHECK (("scale_y" > (0)::numeric)),
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
    "storage_bucket" "text" DEFAULT 'project_images'::"text" NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "color_space" "public"."color_space",
    "file_size_bytes" bigint DEFAULT 0 NOT NULL,
    "dpi" numeric,
    "source_image_id" "uuid",
    "crop_rect_px" "jsonb",
    "is_locked" boolean DEFAULT false NOT NULL,
    "dpi_x" numeric DEFAULT 72 NOT NULL,
    "dpi_y" numeric DEFAULT 72 NOT NULL,
    "kind" "public"."image_kind" NOT NULL,
    CONSTRAINT "project_images_crop_rect_number_int_ck" CHECK ((("crop_rect_px" IS NULL) OR (("jsonb_typeof"(("crop_rect_px" -> 'x'::"text")) = 'number'::"text") AND ("jsonb_typeof"(("crop_rect_px" -> 'y'::"text")) = 'number'::"text") AND ("jsonb_typeof"(("crop_rect_px" -> 'w'::"text")) = 'number'::"text") AND ("jsonb_typeof"(("crop_rect_px" -> 'h'::"text")) = 'number'::"text") AND (((("crop_rect_px" ->> 'x'::"text"))::numeric % (1)::numeric) = (0)::numeric) AND (((("crop_rect_px" ->> 'y'::"text"))::numeric % (1)::numeric) = (0)::numeric) AND (((("crop_rect_px" ->> 'w'::"text"))::numeric % (1)::numeric) = (0)::numeric) AND (((("crop_rect_px" ->> 'h'::"text"))::numeric % (1)::numeric) = (0)::numeric)))),
    CONSTRAINT "project_images_crop_rect_requires_source_ck" CHECK ((("crop_rect_px" IS NULL) OR ("source_image_id" IS NOT NULL))),
    CONSTRAINT "project_images_crop_rect_shape_ck" CHECK ((("crop_rect_px" IS NULL) OR (("jsonb_typeof"("crop_rect_px") = 'object'::"text") AND ("crop_rect_px" ?& ARRAY['x'::"text", 'y'::"text", 'w'::"text", 'h'::"text"]) AND ((((("crop_rect_px" - 'x'::"text") - 'y'::"text") - 'w'::"text") - 'h'::"text") = '{}'::"jsonb")))),
    CONSTRAINT "project_images_crop_rect_value_ck" CHECK ((("crop_rect_px" IS NULL) OR (((("crop_rect_px" ->> 'x'::"text"))::integer >= 0) AND ((("crop_rect_px" ->> 'y'::"text"))::integer >= 0) AND ((("crop_rect_px" ->> 'w'::"text"))::integer >= 10) AND ((("crop_rect_px" ->> 'h'::"text"))::integer >= 10)))),
    CONSTRAINT "project_images_dpi_x_check" CHECK (("dpi_x" > (0)::numeric)),
    CONSTRAINT "project_images_dpi_y_check" CHECK (("dpi_y" > (0)::numeric)),
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
    "width_px_u" "text" NOT NULL,
    "height_px_u" "text" NOT NULL,
    "width_px" integer NOT NULL,
    "height_px" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "raster_effects_preset" "text",
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



CREATE TABLE IF NOT EXISTS "storage"."buckets" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "owner" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "public" boolean DEFAULT false,
    "avif_autodetection" boolean DEFAULT false,
    "file_size_limit" bigint,
    "allowed_mime_types" "text"[],
    "owner_id" "text",
    "type" "storage"."buckettype" DEFAULT 'STANDARD'::"storage"."buckettype" NOT NULL
);


ALTER TABLE "storage"."buckets" OWNER TO "supabase_storage_admin";


COMMENT ON COLUMN "storage"."buckets"."owner" IS 'Field is deprecated, use owner_id instead';



CREATE TABLE IF NOT EXISTS "storage"."buckets_analytics" (
    "name" "text" NOT NULL,
    "type" "storage"."buckettype" DEFAULT 'ANALYTICS'::"storage"."buckettype" NOT NULL,
    "format" "text" DEFAULT 'ICEBERG'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "storage"."buckets_analytics" OWNER TO "supabase_storage_admin";


CREATE TABLE IF NOT EXISTS "storage"."buckets_vectors" (
    "id" "text" NOT NULL,
    "type" "storage"."buckettype" DEFAULT 'VECTOR'::"storage"."buckettype" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "storage"."buckets_vectors" OWNER TO "supabase_storage_admin";


CREATE TABLE IF NOT EXISTS "storage"."migrations" (
    "id" integer NOT NULL,
    "name" character varying(100) NOT NULL,
    "hash" character varying(40) NOT NULL,
    "executed_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE "storage"."migrations" OWNER TO "supabase_storage_admin";


CREATE TABLE IF NOT EXISTS "storage"."objects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "bucket_id" "text",
    "name" "text",
    "owner" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "last_accessed_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb",
    "path_tokens" "text"[] GENERATED ALWAYS AS ("string_to_array"("name", '/'::"text")) STORED,
    "version" "text",
    "owner_id" "text",
    "user_metadata" "jsonb"
);


ALTER TABLE "storage"."objects" OWNER TO "supabase_storage_admin";


COMMENT ON COLUMN "storage"."objects"."owner" IS 'Field is deprecated, use owner_id instead';



CREATE TABLE IF NOT EXISTS "storage"."s3_multipart_uploads" (
    "id" "text" NOT NULL,
    "in_progress_size" bigint DEFAULT 0 NOT NULL,
    "upload_signature" "text" NOT NULL,
    "bucket_id" "text" NOT NULL,
    "key" "text" NOT NULL COLLATE "pg_catalog"."C",
    "version" "text" NOT NULL,
    "owner_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_metadata" "jsonb",
    "metadata" "jsonb"
);


ALTER TABLE "storage"."s3_multipart_uploads" OWNER TO "supabase_storage_admin";


CREATE TABLE IF NOT EXISTS "storage"."s3_multipart_uploads_parts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "upload_id" "text" NOT NULL,
    "size" bigint DEFAULT 0 NOT NULL,
    "part_number" integer NOT NULL,
    "bucket_id" "text" NOT NULL,
    "key" "text" NOT NULL COLLATE "pg_catalog"."C",
    "etag" "text" NOT NULL,
    "owner_id" "text",
    "version" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "storage"."s3_multipart_uploads_parts" OWNER TO "supabase_storage_admin";


CREATE TABLE IF NOT EXISTS "storage"."vector_indexes" (
    "id" "text" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL COLLATE "pg_catalog"."C",
    "bucket_id" "text" NOT NULL,
    "data_type" "text" NOT NULL,
    "dimension" integer NOT NULL,
    "distance_metric" "text" NOT NULL,
    "metadata_configuration" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "storage"."vector_indexes" OWNER TO "supabase_storage_admin";


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



ALTER TABLE ONLY "storage"."buckets_analytics"
    ADD CONSTRAINT "buckets_analytics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."buckets"
    ADD CONSTRAINT "buckets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."buckets_vectors"
    ADD CONSTRAINT "buckets_vectors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."migrations"
    ADD CONSTRAINT "migrations_name_key" UNIQUE ("name");



ALTER TABLE ONLY "storage"."migrations"
    ADD CONSTRAINT "migrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."objects"
    ADD CONSTRAINT "objects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."s3_multipart_uploads_parts"
    ADD CONSTRAINT "s3_multipart_uploads_parts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."s3_multipart_uploads"
    ADD CONSTRAINT "s3_multipart_uploads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "storage"."vector_indexes"
    ADD CONSTRAINT "vector_indexes_pkey" PRIMARY KEY ("id");



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



CREATE UNIQUE INDEX "bname" ON "storage"."buckets" USING "btree" ("name");



CREATE UNIQUE INDEX "bucketid_objname" ON "storage"."objects" USING "btree" ("bucket_id", "name");



CREATE UNIQUE INDEX "buckets_analytics_unique_name_idx" ON "storage"."buckets_analytics" USING "btree" ("name") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_multipart_uploads_list" ON "storage"."s3_multipart_uploads" USING "btree" ("bucket_id", "key", "created_at");



CREATE INDEX "idx_objects_bucket_id_name" ON "storage"."objects" USING "btree" ("bucket_id", "name" COLLATE "C");



CREATE INDEX "idx_objects_bucket_id_name_lower" ON "storage"."objects" USING "btree" ("bucket_id", "lower"("name") COLLATE "C");



CREATE INDEX "name_prefix_search" ON "storage"."objects" USING "btree" ("name" "text_pattern_ops");



CREATE UNIQUE INDEX "vector_indexes_name_bucket_id_idx" ON "storage"."vector_indexes" USING "btree" ("name", "bucket_id");



CREATE OR REPLACE TRIGGER "trg_project_filter_settings_updated_at" BEFORE UPDATE ON "public"."project_filter_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_project_generation_updated_at" BEFORE UPDATE ON "public"."project_generation" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_project_grid_updated_at" BEFORE UPDATE ON "public"."project_grid" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_project_image_filters_updated_at" BEFORE UPDATE ON "public"."project_image_filters" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_project_image_state_updated_at" BEFORE UPDATE ON "public"."project_image_state" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_project_images_guard_master_immutable" BEFORE DELETE OR UPDATE ON "public"."project_images" FOR EACH ROW EXECUTE FUNCTION "public"."guard_master_immutable"();



CREATE OR REPLACE TRIGGER "trg_project_images_updated_at" BEFORE UPDATE ON "public"."project_images" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_project_vec_updated_at" BEFORE UPDATE ON "public"."project_vectorization_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_project_workspace_sync_px_cache" BEFORE INSERT OR UPDATE ON "public"."project_workspace" FOR EACH ROW EXECUTE FUNCTION "public"."project_workspace_sync_px_cache"();



CREATE OR REPLACE TRIGGER "trg_project_workspace_updated_at" BEFORE UPDATE ON "public"."project_workspace" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_projects_updated_at" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "enforce_bucket_name_length_trigger" BEFORE INSERT OR UPDATE OF "name" ON "storage"."buckets" FOR EACH ROW EXECUTE FUNCTION "storage"."enforce_bucket_name_length"();



CREATE OR REPLACE TRIGGER "protect_buckets_delete" BEFORE DELETE ON "storage"."buckets" FOR EACH STATEMENT EXECUTE FUNCTION "storage"."protect_delete"();



CREATE OR REPLACE TRIGGER "protect_objects_delete" BEFORE DELETE ON "storage"."objects" FOR EACH STATEMENT EXECUTE FUNCTION "storage"."protect_delete"();



CREATE OR REPLACE TRIGGER "update_objects_updated_at" BEFORE UPDATE ON "storage"."objects" FOR EACH ROW EXECUTE FUNCTION "storage"."update_updated_at_column"();



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
    ADD CONSTRAINT "project_images_source_image_id_fkey" FOREIGN KEY ("source_image_id") REFERENCES "public"."project_images"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "storage"."objects"
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY ("bucket_id") REFERENCES "storage"."buckets"("id");



ALTER TABLE ONLY "storage"."s3_multipart_uploads"
    ADD CONSTRAINT "s3_multipart_uploads_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "storage"."buckets"("id");



ALTER TABLE ONLY "storage"."s3_multipart_uploads_parts"
    ADD CONSTRAINT "s3_multipart_uploads_parts_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "storage"."buckets"("id");



ALTER TABLE ONLY "storage"."s3_multipart_uploads_parts"
    ADD CONSTRAINT "s3_multipart_uploads_parts_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "storage"."s3_multipart_uploads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "storage"."vector_indexes"
    ADD CONSTRAINT "vector_indexes_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "storage"."buckets_vectors"("id");



ALTER TABLE "public"."project_filter_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_filter_settings_delete_owner" ON "public"."project_filter_settings" FOR DELETE USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_filter_settings_insert_owner" ON "public"."project_filter_settings" FOR INSERT WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_filter_settings_owner_all" ON "public"."project_filter_settings" USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"())))) WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_filter_settings_select_owner" ON "public"."project_filter_settings" FOR SELECT USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_filter_settings_update_owner" ON "public"."project_filter_settings" FOR UPDATE USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"())))) WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



ALTER TABLE "public"."project_generation" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_generation_delete_owner" ON "public"."project_generation" FOR DELETE USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_generation_insert_owner" ON "public"."project_generation" FOR INSERT WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_generation_owner_all" ON "public"."project_generation" USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"())))) WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_generation_select_owner" ON "public"."project_generation" FOR SELECT USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_generation_update_owner" ON "public"."project_generation" FOR UPDATE USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"())))) WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



ALTER TABLE "public"."project_grid" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_grid_delete_owner" ON "public"."project_grid" FOR DELETE USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_grid_insert_owner" ON "public"."project_grid" FOR INSERT WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_grid_select_owner" ON "public"."project_grid" FOR SELECT USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_grid_update_owner" ON "public"."project_grid" FOR UPDATE USING (("project_id" IN ( SELECT "projects"."id"
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


CREATE POLICY "project_image_state_delete_owner" ON "public"."project_image_state" FOR DELETE USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_image_state_insert_owner" ON "public"."project_image_state" FOR INSERT WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_image_state_select_owner" ON "public"."project_image_state" FOR SELECT USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_image_state_update_owner" ON "public"."project_image_state" FOR UPDATE USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"())))) WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



ALTER TABLE "public"."project_images" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_images_delete_owner" ON "public"."project_images" FOR DELETE USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_images_insert_owner" ON "public"."project_images" FOR INSERT WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



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



CREATE POLICY "project_images_select_owner" ON "public"."project_images" FOR SELECT USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_images_update_owner" ON "public"."project_images" FOR UPDATE USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"())))) WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



ALTER TABLE "public"."project_pdfs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_pdfs_delete_owner" ON "public"."project_pdfs" FOR DELETE USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_pdfs_insert_owner" ON "public"."project_pdfs" FOR INSERT WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_pdfs_select_owner" ON "public"."project_pdfs" FOR SELECT USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_pdfs_update_owner" ON "public"."project_pdfs" FOR UPDATE USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"())))) WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_vec_delete_owner" ON "public"."project_vectorization_settings" FOR DELETE USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_vec_insert_owner" ON "public"."project_vectorization_settings" FOR INSERT WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_vec_select_owner" ON "public"."project_vectorization_settings" FOR SELECT USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_vec_update_owner" ON "public"."project_vectorization_settings" FOR UPDATE USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"())))) WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



ALTER TABLE "public"."project_vectorization_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_workspace" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_workspace_delete_owner" ON "public"."project_workspace" FOR DELETE USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_workspace_insert_owner" ON "public"."project_workspace" FOR INSERT WITH CHECK (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_workspace_select_owner" ON "public"."project_workspace" FOR SELECT USING (("project_id" IN ( SELECT "projects"."id"
   FROM "public"."projects"
  WHERE ("projects"."owner_id" = "auth"."uid"()))));



CREATE POLICY "project_workspace_update_owner" ON "public"."project_workspace" FOR UPDATE USING (("project_id" IN ( SELECT "projects"."id"
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


ALTER TABLE "storage"."buckets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."buckets_analytics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."buckets_vectors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."migrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."objects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_images_storage_delete_owner" ON "storage"."objects" FOR DELETE USING ((("bucket_id" = 'project_images'::"text") AND ("name" ~ '^projects/[0-9a-fA-F-]{36}/images/.+'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE ((("p"."id")::"text" = "substring"("objects"."name", '^projects/([0-9a-fA-F-]{36})/'::"text")) AND ("p"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "project_images_storage_insert_owner" ON "storage"."objects" FOR INSERT WITH CHECK ((("bucket_id" = 'project_images'::"text") AND ("name" ~ '^projects/[0-9a-fA-F-]{36}/images/.+'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE ((("p"."id")::"text" = "substring"("objects"."name", '^projects/([0-9a-fA-F-]{36})/'::"text")) AND ("p"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "project_images_storage_select_owner" ON "storage"."objects" FOR SELECT USING ((("bucket_id" = 'project_images'::"text") AND ("name" ~ '^projects/[0-9a-fA-F-]{36}/images/.+'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE ((("p"."id")::"text" = "substring"("objects"."name", '^projects/([0-9a-fA-F-]{36})/'::"text")) AND ("p"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "project_images_storage_update_owner" ON "storage"."objects" FOR UPDATE USING ((("bucket_id" = 'project_images'::"text") AND ("name" ~ '^projects/[0-9a-fA-F-]{36}/images/.+'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE ((("p"."id")::"text" = "substring"("objects"."name", '^projects/([0-9a-fA-F-]{36})/'::"text")) AND ("p"."owner_id" = "auth"."uid"())))))) WITH CHECK ((("bucket_id" = 'project_images'::"text") AND ("name" ~ '^projects/[0-9a-fA-F-]{36}/images/.+'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE ((("p"."id")::"text" = "substring"("objects"."name", '^projects/([0-9a-fA-F-]{36})/'::"text")) AND ("p"."owner_id" = "auth"."uid"()))))));



ALTER TABLE "storage"."s3_multipart_uploads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."s3_multipart_uploads_parts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "storage"."vector_indexes" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT USAGE ON SCHEMA "storage" TO "postgres" WITH GRANT OPTION;
GRANT USAGE ON SCHEMA "storage" TO "anon";
GRANT USAGE ON SCHEMA "storage" TO "authenticated";
GRANT USAGE ON SCHEMA "storage" TO "service_role";
GRANT ALL ON SCHEMA "storage" TO "supabase_storage_admin" WITH GRANT OPTION;
GRANT ALL ON SCHEMA "storage" TO "dashboard_user";



GRANT ALL ON FUNCTION "public"."append_project_image_filter"("p_project_id" "uuid", "p_input_image_id" "uuid", "p_output_image_id" "uuid", "p_filter_type" "text", "p_filter_params" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."append_project_image_filter"("p_project_id" "uuid", "p_input_image_id" "uuid", "p_output_image_id" "uuid", "p_filter_type" "text", "p_filter_params" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."append_project_image_filter"("p_project_id" "uuid", "p_input_image_id" "uuid", "p_output_image_id" "uuid", "p_filter_type" "text", "p_filter_params" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."collect_project_image_delete_targets"("p_project_id" "uuid", "p_root_image_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."collect_project_image_delete_targets"("p_project_id" "uuid", "p_root_image_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."collect_project_image_delete_targets"("p_project_id" "uuid", "p_root_image_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_project"("p_project_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_project"("p_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_project"("p_project_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_master_immutable"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_master_immutable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_master_immutable"() TO "service_role";



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



REVOKE ALL ON TABLE "storage"."buckets" FROM "supabase_storage_admin";
GRANT ALL ON TABLE "storage"."buckets" TO "supabase_storage_admin" WITH GRANT OPTION;
GRANT ALL ON TABLE "storage"."buckets" TO "service_role";
GRANT ALL ON TABLE "storage"."buckets" TO "authenticated";
GRANT ALL ON TABLE "storage"."buckets" TO "anon";
GRANT ALL ON TABLE "storage"."buckets" TO "postgres" WITH GRANT OPTION;



GRANT ALL ON TABLE "storage"."buckets_analytics" TO "service_role";
GRANT ALL ON TABLE "storage"."buckets_analytics" TO "authenticated";
GRANT ALL ON TABLE "storage"."buckets_analytics" TO "anon";



GRANT SELECT ON TABLE "storage"."buckets_vectors" TO "service_role";
GRANT SELECT ON TABLE "storage"."buckets_vectors" TO "authenticated";
GRANT SELECT ON TABLE "storage"."buckets_vectors" TO "anon";



REVOKE ALL ON TABLE "storage"."objects" FROM "supabase_storage_admin";
GRANT ALL ON TABLE "storage"."objects" TO "supabase_storage_admin" WITH GRANT OPTION;
GRANT ALL ON TABLE "storage"."objects" TO "service_role";
GRANT ALL ON TABLE "storage"."objects" TO "authenticated";
GRANT ALL ON TABLE "storage"."objects" TO "anon";
GRANT ALL ON TABLE "storage"."objects" TO "postgres" WITH GRANT OPTION;



GRANT ALL ON TABLE "storage"."s3_multipart_uploads" TO "service_role";
GRANT SELECT ON TABLE "storage"."s3_multipart_uploads" TO "authenticated";
GRANT SELECT ON TABLE "storage"."s3_multipart_uploads" TO "anon";



GRANT ALL ON TABLE "storage"."s3_multipart_uploads_parts" TO "service_role";
GRANT SELECT ON TABLE "storage"."s3_multipart_uploads_parts" TO "authenticated";
GRANT SELECT ON TABLE "storage"."s3_multipart_uploads_parts" TO "anon";



GRANT SELECT ON TABLE "storage"."vector_indexes" TO "service_role";
GRANT SELECT ON TABLE "storage"."vector_indexes" TO "authenticated";
GRANT SELECT ON TABLE "storage"."vector_indexes" TO "anon";



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






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON SEQUENCES TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON FUNCTIONS TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "storage" GRANT ALL ON TABLES TO "service_role";




