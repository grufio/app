/**
 * GET-cache invalidation for project-scoped mutations.
 *
 * `lib/api/http.ts` exposes the low-level `invalidateFetchJsonGetCache`
 * primitive — this module wraps it with named scopes so call sites
 * don't have to remember which endpoint paths to flush after each
 * mutation. Three scopes cover the project surface:
 *
 *   - `images`  → `/api/projects/{id}/images/master`
 *                 `/api/projects/{id}/images/master/list`
 *   - `filters` → `/api/projects/{id}/images/filters`
 *   - `trace`   → `/api/projects/{id}/trace`
 *
 * Call sites in `project-images.ts` / `project-trace.ts` pass the
 * union of scopes their mutation touches. The pair `["images"]` is
 * the by-far-most-common case and matches the previous hand-rolled
 * `invalidateFetchJsonGetCache(master); invalidateFetchJsonGetCache(masterList)`
 * pattern verbatim.
 */
import { invalidateFetchJsonGetCache } from "@/lib/api/http"

export type ProjectMutationScope = "images" | "filters" | "trace"

export function invalidateProjectMutationCaches(
  projectId: string,
  scopes: ProjectMutationScope[],
): void {
  const seen = new Set<ProjectMutationScope>(scopes)
  if (seen.has("images")) {
    invalidateFetchJsonGetCache(`/api/projects/${projectId}/images/master`)
    invalidateFetchJsonGetCache(`/api/projects/${projectId}/images/master/list`)
  }
  if (seen.has("filters")) {
    invalidateFetchJsonGetCache(`/api/projects/${projectId}/images/filters`)
  }
  if (seen.has("trace")) {
    invalidateFetchJsonGetCache(`/api/projects/${projectId}/trace`)
  }
}
