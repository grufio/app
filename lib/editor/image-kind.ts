export type ImageKind = "master" | "working_copy" | "filter_working_copy" | "trace_output"

export const IMAGE_KIND = {
  MASTER: "master",
  WORKING_COPY: "working_copy",
  FILTER_WORKING_COPY: "filter_working_copy",
  TRACE_OUTPUT: "trace_output",
} as const satisfies Record<string, ImageKind>

type Row = {
  kind?: string | null
  source_image_id?: string | null
  name?: string | null
}

export function resolveImageKind(row: Row): ImageKind {
  const explicitKind = String(row.kind ?? "").trim()
  if (
    explicitKind === "master" ||
    explicitKind === "working_copy" ||
    explicitKind === "filter_working_copy" ||
    explicitKind === "trace_output"
  ) {
    return explicitKind
  }
  // Defensive fallback for rows that somehow lost their kind value (the column is
  // NOT NULL, so this should be unreachable in practice).
  const normalizedName = String(row.name ?? "").toLowerCase()
  if (normalizedName.endsWith("(numerate)") || normalizedName.endsWith("(line art)")) return "trace_output"
  if (normalizedName.endsWith("(filter working)")) return "filter_working_copy"
  if (row.source_image_id) return "filter_working_copy"
  return "working_copy"
}
