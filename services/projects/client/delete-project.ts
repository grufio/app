/**
 * Projects service (client): delete project.
 *
 * Responsibilities:
 * - Perform the delete-project HTTP request.
 * - Preserve existing UI behavior (silent no-op on non-OK responses).
 */
export async function deleteProjectClient(projectId: string): Promise<boolean> {
  const res = await fetch(`/api/projects/${projectId}`, {
    method: "DELETE",
    credentials: "same-origin",
  })
  return res.ok
}

