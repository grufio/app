export type DeleteReason =
  | "no_active_image"
  | "master_immutable"

export type ImageKind = "master" | "working_copy" | "filter_working_copy"

export function evaluateDeleteTarget(args: {
  targetImageId: string | null
  targetKind: ImageKind | null
}): { deletable: boolean; delete_reason: DeleteReason | null } {
  const { targetImageId, targetKind } = args
  if (!targetImageId) return { deletable: false, delete_reason: "no_active_image" }
  if (targetKind === "master") return { deletable: false, delete_reason: "master_immutable" }
  return { deletable: true, delete_reason: null }
}
