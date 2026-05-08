"use client"

/**
 * Image transform panel.
 *
 * Responsibilities:
 * - Edit the working image size and alignment in the editor.
 * - Render the section header with Restore + Delete actions.
 * - Dispatch commits to the canvas stage imperative API.
 *
 * The panel is split into three sub-components for testability and so each
 * one stays focused on a single concern:
 * - ImageSizeInputs       (width/height + lock-aspect)
 * - ImagePositionInputs   (x/y in artboard units + center-on-artboard)
 * - ImageAlignmentControls (left/center/right + top/center/bottom)
 *
 * The header (Restore / Delete buttons) lives here too — visually it's
 * part of the section, and keeping the actions adjacent to the panel
 * means the right-panel shell doesn't need to know about image
 * lifecycle ops.
 */
import { RotateCcw, Trash2 } from "lucide-react"

import type { Unit } from "@/lib/editor/units"

import { EditorSidebarSection } from "./sidebar/editor-sidebar-section"
import { ImageAlignmentControls } from "./image-panel/image-alignment-controls"
import { ImagePositionInputs } from "./image-panel/image-position-inputs"
import { ImageSizeInputs } from "./image-panel/image-size-inputs"
import { RightPanelIconButton } from "./right-panel-controls"

type Props = {
  widthPxU?: bigint
  heightPxU?: bigint
  xPxU?: bigint
  yPxU?: bigint
  unit: Unit
  /**
   * When false, inputs stay empty and commits are ignored.
   * Use this to prevent "flash" / drift while upstream meta/state is still loading.
   */
  ready?: boolean
  disabled?: boolean
  onCommit: (widthPxU: bigint, heightPxU: bigint) => void
  onCommitPosition: (xPxU: bigint, yPxU: bigint) => void
  onAlign: (opts: { x?: "left" | "center" | "right"; y?: "top" | "center" | "bottom" }) => void
  // Header actions — restore (open dialog) and delete (request delete).
  canRestore?: boolean
  canDelete?: boolean
  onRestore?: () => void
  onDelete?: () => void
  // Native pixel dimensions of the master image. When provided, the
  // size row shows a "reset to native size" quick-action.
  nativeWidthPx?: number
  nativeHeightPx?: number
}

/**
 * Image sizing panel.
 *
 * The UI displays image size in the artboard's unit,
 * but commits changes in pixels to the canvas (so scaling remains stable).
 */
export function ImagePanel({
  widthPxU,
  heightPxU,
  xPxU,
  yPxU,
  unit,
  ready = true,
  disabled,
  onCommit,
  onCommitPosition,
  onAlign,
  canRestore = false,
  canDelete = false,
  onRestore,
  onDelete,
  nativeWidthPx,
  nativeHeightPx,
}: Props) {
  const controlsDisabled = Boolean(disabled) || !ready

  return (
    <EditorSidebarSection
      title="Image"
      headerActions={
        <>
          <RightPanelIconButton
            type="button"
            aria-label="Restore image"
            disabled={!canRestore}
            onClick={onRestore}
          >
            <RotateCcw className="size-4" strokeWidth={1} />
          </RightPanelIconButton>
          <RightPanelIconButton
            type="button"
            aria-label="Delete image"
            disabled={!canDelete}
            onClick={onDelete}
          >
            <Trash2 className="size-4" strokeWidth={1} />
          </RightPanelIconButton>
        </>
      }
    >
      <div className="space-y-4">
        {nativeWidthPx && nativeHeightPx ? (
          <details className="group text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none list-none">
              <span className="group-open:hidden">Details</span>
              <span className="hidden group-open:inline">Hide details</span>
            </summary>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
              <dt>Native</dt>
              <dd>
                {nativeWidthPx} × {nativeHeightPx} px
              </dd>
            </dl>
          </details>
        ) : null}

        <ImageSizeInputs
          widthPxU={widthPxU}
          heightPxU={heightPxU}
          unit={unit}
          ready={ready}
          controlsDisabled={controlsDisabled}
          onCommit={onCommit}
          nativeWidthPx={nativeWidthPx}
          nativeHeightPx={nativeHeightPx}
        />

        <ImagePositionInputs
          xPxU={xPxU}
          yPxU={yPxU}
          unit={unit}
          ready={ready}
          controlsDisabled={controlsDisabled}
          onCommitPosition={onCommitPosition}
          onAlign={onAlign}
        />

        <ImageAlignmentControls controlsDisabled={controlsDisabled} onAlign={onAlign} />
      </div>
    </EditorSidebarSection>
  )
}
