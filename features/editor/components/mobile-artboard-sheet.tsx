"use client"

/**
 * Mobile full-screen Artboard sheet.
 *
 * One of the three standalone dialogs the artboard section's top-left
 * "+" menu opens (alongside `MobileGridSheet` + `MobileImageSheet`).
 * Holds the two always-present artboard properties as stacked
 * sections — `ArtboardPanel` (size) first, then `PageBackgroundSection`
 * (background colour) — mirroring the desktop right panel.
 *
 * Render shape: an `absolute inset-0` overlay inside the editor
 * layout container (mobile) or a bounded floating card on `md+`
 * (`desktop`). The layout's parent has `position: relative` so the
 * sheet is bounded to the editor area.
 */
import dynamic from "next/dynamic"

import { mobileSheetRootClass } from "./mobile-sheet-shell"
import { PageBackgroundSection } from "./page-background-section"
import { SheetHeader } from "./sheet-chrome"

// Mirror the right panel's code-splitting so the bundle cost is paid
// once, not twice. The dynamic chunk is shared with the desktop right
// panel when both code paths eventually render.
const ArtboardPanel = dynamic(() => import("./artboard-panel").then((m) => m.ArtboardPanel), {
  ssr: false,
  loading: () => null,
})

export function MobileArtboardSheet(props: {
  onClose: () => void
  /** Desktop variant — bounded floating card instead of fullscreen. */
  desktop?: boolean
  // ArtboardPanel
  canFit: boolean
  onFitArtboardToImage?: () => void | Promise<void>
  // Page-Background controls
  pageBgEnabled: boolean
  pageBgColor: string
  pageBgOpacity: number
  onPageBgEnabledChange: (v: boolean) => void
  onPageBgColorChange: (v: string) => void
  onPageBgOpacityChange: (v: number) => void
}) {
  const {
    onClose,
    desktop,
    canFit,
    onFitArtboardToImage,
    pageBgEnabled,
    pageBgColor,
    pageBgOpacity,
    onPageBgEnabledChange,
    onPageBgColorChange,
    onPageBgOpacityChange,
  } = props

  return (
    <section aria-label="Artboard" className={mobileSheetRootClass(desktop)}>
      <SheetHeader title="Artboard" onClose={onClose} />

      <div className="flex-1 overflow-y-auto">
        <ArtboardPanel canFitToImage={canFit} onFitToImage={onFitArtboardToImage} />
        <PageBackgroundSection
          pageBgEnabled={pageBgEnabled}
          pageBgColor={pageBgColor}
          pageBgOpacity={pageBgOpacity}
          onPageBgEnabledChange={onPageBgEnabledChange}
          onPageBgColorChange={onPageBgColorChange}
          onPageBgOpacityChange={onPageBgOpacityChange}
        />
      </div>
    </section>
  )
}
