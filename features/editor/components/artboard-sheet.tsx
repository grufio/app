"use client"

/**
 * Editor Artboard sheet (full-screen on mobile, bounded card on desktop).
 *
 * One of the three standalone dialogs the artboard section's top-left
 * "+" menu opens (alongside `GridSheet` + `ImageSheet`).
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

import { sheetRootClass } from "./sheet-shell"
import { PaddingSection } from "./padding-section"
import { PageBackgroundSection } from "./page-background-section"
import { SheetHeader } from "./sheet-chrome"

// Mirror the right panel's code-splitting so the bundle cost is paid
// once, not twice. The dynamic chunk is shared with the desktop right
// panel when both code paths eventually render.
const ArtboardPanel = dynamic(() => import("./artboard-panel").then((m) => m.ArtboardPanel), {
  ssr: false,
  loading: () => null,
})

export function ArtboardSheet(props: {
  onClose: () => void
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
  // Padding controls (mm)
  paddingTop: string
  paddingBottom: string
  paddingLeft: string
  paddingRight: string
  onPaddingTopChange: (v: string) => void
  onPaddingBottomChange: (v: string) => void
  onPaddingLeftChange: (v: string) => void
  onPaddingRightChange: (v: string) => void
}) {
  const {
    onClose,
    canFit,
    onFitArtboardToImage,
    pageBgEnabled,
    pageBgColor,
    pageBgOpacity,
    onPageBgEnabledChange,
    onPageBgColorChange,
    onPageBgOpacityChange,
    paddingTop,
    paddingBottom,
    paddingLeft,
    paddingRight,
    onPaddingTopChange,
    onPaddingBottomChange,
    onPaddingLeftChange,
    onPaddingRightChange,
  } = props

  return (
    <section aria-label="Artboard" className={sheetRootClass()}>
      <SheetHeader title="Artboard" onClose={onClose} />

      <div className="flex-1 overflow-y-auto">
        <ArtboardPanel canFitToImage={canFit} onFitToImage={onFitArtboardToImage} />
        <PaddingSection
          paddingTop={paddingTop}
          paddingBottom={paddingBottom}
          paddingLeft={paddingLeft}
          paddingRight={paddingRight}
          onPaddingTopChange={onPaddingTopChange}
          onPaddingBottomChange={onPaddingBottomChange}
          onPaddingLeftChange={onPaddingLeftChange}
          onPaddingRightChange={onPaddingRightChange}
        />
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
