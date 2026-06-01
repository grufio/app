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
import { Maximize2, RotateCcw, Trash2 } from "lucide-react"

import type { Unit } from "@/lib/editor/units"

import { EditorSidebarSection } from "./sidebar/editor-sidebar-section"
import { ImageAlignmentControls } from "./image-panel/image-alignment-controls"
import { ImagePositionInputs } from "./image-panel/image-position-inputs"
import { ImageSizeInputs } from "./image-panel/image-size-inputs"
import { RightPanelIconButton } from "./right-panel-controls"
import { SectionLockToggle } from "./section-lock-toggle"

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
  /** Section-lock derived from downstream-data presence. When set,
   * the panel renders the amber section tone and surfaces a header
   * lock-toggle icon; inputs are also held disabled via the
   * `disabled` prop (the shell ORs the lock state into it via
   * `useImagePanelEnabled`). */
  lock?: {
    message: string
    toggleable: boolean
    busy?: boolean
    onUnlock?: () => void
  } | null
  onCommit: (widthPxU: bigint, heightPxU: bigint) => void
  onCommitPosition: (opts: { xPxU?: bigint; yPxU?: bigint }) => void
  onAlign: (opts: { x?: "left" | "center" | "right"; y?: "top" | "center" | "bottom" }) => void
  // Header actions — restore (open dialog), fit-to-artboard, delete (request delete).
  canRestore?: boolean
  canFit?: boolean
  canDelete?: boolean
  onRestore?: () => void
  onFitToArtboard?: () => void
  onDelete?: () => void
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
  lock,
  onCommit,
  onCommitPosition,
  onAlign,
  canRestore = false,
  canFit = false,
  canDelete = false,
  onRestore,
  onFitToArtboard,
  onDelete,
}: Props) {
  const controlsDisabled = Boolean(disabled) || !ready
  const isLocked = lock != null

  return (
    <EditorSidebarSection
      title="Image"
      locked={isLocked}
      headerActions={
        <>
          <RightPanelIconButton
            type="button"
            aria-label="Restore image"
            disabled={!canRestore || isLocked}
            onClick={onRestore}
          >
            <RotateCcw className="size-4" />
          </RightPanelIconButton>
          <RightPanelIconButton
            type="button"
            aria-label="Fit image to artboard"
            disabled={!canFit || isLocked}
            onClick={onFitToArtboard}
          >
            <Maximize2 className="size-4" />
          </RightPanelIconButton>
          <SectionLockToggle lock={lock ?? null} />
          <RightPanelIconButton
            type="button"
            aria-label="Delete image"
            disabled={!canDelete || isLocked}
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </RightPanelIconButton>
        </>
      }
    >
      <div className="space-y-4">
        <ImageSizeInputs
          widthPxU={widthPxU}
          heightPxU={heightPxU}
          unit={unit}
          ready={ready}
          controlsDisabled={controlsDisabled}
          onCommit={onCommit}
        />

        <ImagePositionInputs
          xPxU={xPxU}
          yPxU={yPxU}
          unit={unit}
          ready={ready}
          controlsDisabled={controlsDisabled}
          onCommitPosition={onCommitPosition}
        />

        <ImageAlignmentControls controlsDisabled={controlsDisabled} onAlign={onAlign} />
      </div>
    </EditorSidebarSection>
  )
}
