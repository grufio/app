/**
 * Projects service (client): create project.
 *
 * Responsibilities:
 * - Perform the create-project HTTP request and validate the response shape.
 * - Preserve the UI's error semantics (throw on failure; caller decides how to present errors).
 */
import type { Unit } from "@/lib/editor/units"

export async function createProjectClient(input: {
  name: string
  unit: Unit
  width_value: number
  height_value: number
  dpi: number
}): Promise<{ id: string }> {
  const res = await fetch("/api/projects/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Create failed (${res.status})`)
  }
  const json = (await res.json()) as { id?: string }
  if (!json?.id) throw new Error("Create failed: missing project id")
  return { id: json.id }
}

