"use client"

/**
 * Mobile full-screen Grid sheet.
 *
 * One of the three standalone dialogs the artboard section's top-left
 * "+" menu opens (alongside `MobileArtboardSheet` + `MobileImageSheet`).
 *
 * Progressive disclosure (mirroring desktop):
 * - No grid yet: a desktop-style nav-row (icon + label + `+` action) to
 *   create one. In practice the "+" menu quick-creates a grid before
 *   this dialog opens, so the Add-row is the empty-state fallback.
 * - Grid exists: swaps to `GridPanel` (visibility toggle + delete).
 *   Delete-grid reverts to the row.
 *
 * The Add-row reuses `SidebarMenuAction` — a shared sidebar primitive,
 * no surface-specific button variant. Render shape matches the other
 * section sheets (`mobileSheetRootClass`).
 */
import dynamic from "next/dynamic"
import { Grid3x3, Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SidebarMenuAction } from "@/components/ui/sidebar"

import { mobileSheetRootClass } from "./mobile-sheet-shell"

const GridPanel = dynamic(() => import("./grid-panel").then((m) => m.GridPanel), {
  ssr: false,
  loading: () => null,
})

export function MobileGridSheet(props: {
  onClose: () => void
  /** Desktop variant — bounded floating card instead of fullscreen. */
  desktop?: boolean
  /** hasGrid drives the swap between the Add-row and GridPanel. */
  hasGrid: boolean
  gridVisible: boolean
  onGridVisibleChange: (v: boolean) => void
  onGridCreateRequested: () => void | Promise<void>
  onGridDeleteRequested: () => void | Promise<void>
}) {
  const {
    onClose,
    desktop,
    hasGrid,
    gridVisible,
    onGridVisibleChange,
    onGridCreateRequested,
    onGridDeleteRequested,
  } = props

  return (
    <section aria-label="Grid" className={mobileSheetRootClass(desktop)}>
      <header className="flex shrink-0 items-center justify-between border-b bg-background px-4 py-3">
        <h2 className="text-sm font-semibold">Grid</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close"
          onClick={onClose}
        >
          <X aria-hidden="true" className="size-5" />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {hasGrid ? (
          <GridPanel
            gridVisible={gridVisible}
            onGridVisibleChange={onGridVisibleChange}
            onDelete={onGridDeleteRequested}
          />
        ) : (
          /* Compact nav-style row: text-xs label with an icon on the
           * left, `+` action absolute-positioned top-right by
           * SidebarMenuAction's default variant. No section header. */
          <div className="relative flex items-center gap-2 border-b px-3 py-2 text-xs">
            <Grid3x3 className="size-4 shrink-0" />
            <span>Grid</span>
            <SidebarMenuAction aria-label="Add Grid" onClick={() => void onGridCreateRequested()}>
              <Plus />
            </SidebarMenuAction>
          </div>
        )}
      </div>
    </section>
  )
}
