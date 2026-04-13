import { useEffect, useRef } from "react"

export function useImageStateLoadOrchestration(args: {
  imageId: string | null
  loadImageState: () => Promise<void>
}) {
  const { imageId, loadImageState } = args
  const loadedImageStateForImageIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!imageId) {
      loadedImageStateForImageIdRef.current = null
      return
    }
    if (loadedImageStateForImageIdRef.current === imageId) return
    loadedImageStateForImageIdRef.current = imageId
    void loadImageState()
  }, [imageId, loadImageState])
}
