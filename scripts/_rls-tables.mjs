/**
 * Shared list of `public` tables that must have RLS enabled and at least one
 * owner-only policy. Used by both `verify-rls.mjs` (local schema) and
 * `verify-remote-rls.mjs` (live remote schema dump). Project_image_filters joined
 * the list when filter chains went into RLS-controlled storage in 2026-02.
 */
export const RLS_PROTECTED_TABLES = [
  "projects",
  "project_images",
  "project_image_filters",
  "project_workspace",
  "project_grid",
  "project_image_state",
  "project_vectorization_settings",
  "project_pdfs",
  "project_filter_settings",
  "project_generation",
]
