type ImageLike = { id: string }

export function resolveDeleteTargetImageId(args: {
  selectedImageId: string | null
  projectImages: ImageLike[]
  activeImageId: string | null
}): string | null {
  const { selectedImageId, projectImages, activeImageId } = args
  if (selectedImageId && projectImages.some((img) => img.id === selectedImageId)) {
    return selectedImageId
  }
  return activeImageId
}

export function isStaleSelectionDeleteError(message: string): boolean {
  return message.includes("stage=stale_selection")
}
