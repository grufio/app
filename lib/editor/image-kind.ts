export type ImageKind = "master" | "working_copy" | "filter_working_copy"

type Row = {
  role?: string | null
  kind?: string | null
  source_image_id?: string | null
  name?: string | null
}

export function resolveImageKind(row: Row): ImageKind {
  const explicitKind = String(row.kind ?? "").trim()
  if (explicitKind === "master" || explicitKind === "working_copy" || explicitKind === "filter_working_copy") {
    return explicitKind
  }
  // Backward-compatible derivation for rows not yet backfilled.
  if (row.role === "master") return "master"
  const normalizedName = String(row.name ?? "").toLowerCase()
  if (normalizedName.endsWith("(filter working)")) return "filter_working_copy"
  if (row.source_image_id) return "filter_working_copy"
  return "working_copy"
}
