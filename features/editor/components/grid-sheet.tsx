"use client"

/**
 * Editor Grid sheet (full-screen on mobile, bounded card on desktop).
 *
 * Legacy grid dialog. Grid is currently removed from the editor nav — this
 * component and `GridPanel` are kept as code (no entry point renders them)
 * so the feature can be re-enabled later.
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
 * section sheets (`sheetRootClass`).
 */
import dynamic from "next/dynamic"
import { Grid3x3, Plus } from "lucide-react"

import { SidebarMenuAction } from "@/components/ui/sidebar"

import { sheetRootClass } from "./sheet-shell"
import { SheetAddRow, SheetHeader } from "./sheet-chrome"

const GridPanel = dynamic(() => import("./grid-panel").then((m) => m.GridPanel), {
  ssr: false,
  loading: () => null,
})

export function GridSheet(props: {
  onClose: () => void
  /** hasGrid drives the swap between the Add-row and GridPanel. */
  hasGrid: boolean
  gridVisible: boolean
  onGridVisibleChange: (v: boolean) => void
  onGridCreateRequested: () => void | Promise<void>
  onGridDeleteRequested: () => void | Promise<void>
}) {
  const {
    onClose,
    hasGrid,
    gridVisible,
    onGridVisibleChange,
    onGridCreateRequested,
    onGridDeleteRequested,
  } = props

  return (
    <section aria-label="Grid" className={sheetRootClass()}>
      <SheetHeader title="Grid" onClose={onClose} />

      <div className="flex-1 overflow-y-auto">
        {hasGrid ? (
          <GridPanel
            gridVisible={gridVisible}
            onGridVisibleChange={onGridVisibleChange}
            onDelete={onGridDeleteRequested}
          />
        ) : (
          <SheetAddRow Icon={Grid3x3} label="Grid">
            <SidebarMenuAction aria-label="Add Grid" onClick={() => void onGridCreateRequested()}>
              <Plus />
            </SidebarMenuAction>
          </SheetAddRow>
        )}
      </div>
    </section>
  )
}
