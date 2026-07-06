-- Pin search_path on the three RPCs that were still search_path-mutable.
--
-- append_project_image_filter, delete_project and remove_project_image_filter
-- had no search_path set (the Supabase linter's function_search_path_mutable
-- warning). Pinning it removes the resolution ambiguity: even though every
-- body already schema-qualifies its table references (public.*) and only calls
-- pg_catalog functions, an unpinned search_path is fragile hardening.
--
-- Value matches the repo's existing convention for hardened functions
-- ('public', 'pg_temp' — public resolvable, pg_temp last so a temp object
-- can't shadow a real one). These functions are SECURITY INVOKER, so this is
-- hygiene, not a privilege boundary.

ALTER FUNCTION "public"."append_project_image_filter"("uuid", "uuid", "uuid", "text", "jsonb")
  SET "search_path" TO 'public', 'pg_temp';

ALTER FUNCTION "public"."delete_project"("uuid")
  SET "search_path" TO 'public', 'pg_temp';

ALTER FUNCTION "public"."remove_project_image_filter"("uuid", "uuid", "jsonb")
  SET "search_path" TO 'public', 'pg_temp';
