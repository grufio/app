"use client"

/**
 * Floating **functions** bar in the top-right corner of the editor canvas,
 * directly beneath the theme/Eye bar (`EditorTopRightBar`). It shows the
 * active section's function frames as an always-visible vertical column —
 * no parent icon, no open/close trigger:
 *
 *   - Trace  → the three trace kinds (mutually exclusive; Edit + Delete on the
 *     active row)
 *   - Filter → the three filter kinds (parallel; instant apply; Delete on the
 *     active row; applying is disabled while a trace depends on the filter)
 *   - Image/Artboard → the three frames (Artboard/Page, Grid, Image), each
 *     launching its standalone dialog; Grid quick-creates when empty
 *   - Colors → nothing (read-only palette)
 *
 * Section *switching* lives in `EditorNav` (top-left, vertical); this bar only
 * exposes the active section's functions. Frames are right-aligned (under the
 * theme toggle) and the active row's Edit/Delete circles flank it on the left.
 */
import {
  CircleDashed,
  CircleDot,
  Contrast,
  Frame,
  Grid2x2,
  Grid3x3,
  Image as ImageIcon,
  Pencil,
  Spline,
  Sun,
  type LucideIcon,
} from "lucide-react"

import type { RegisteredFilterId } from "@/lib/editor/filters/registry"
import type { ArtboardDialog, EditorSection } from "@/lib/editor/editor-sections"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

import { EditorFunctionList, type FabMenuItem } from "./editor-function-list"

type TraceKindItem = { key: RegisteredTraceId; label: string; Icon: LucideIcon }

const TRACE_KIND_ITEMS: TraceKindItem[] = [
  { key: "pixelate", label: "Pixelate", Icon: Grid2x2 },
  { key: "circulate", label: "Circulate", Icon: CircleDot },
  { key: "lineart", label: "Lineart", Icon: Spline },
]

type FilterKindItem = { key: RegisteredFilterId; label: string; Icon: LucideIcon }

// Filters share a single sidebar icon today; give each a distinct glyph so the
// stacked frames are tellable apart (hard / soft / warm). Tunable.
const FILTER_KIND_ITEMS: FilterKindItem[] = [
  { key: "bw_hard", label: "B&W Hard", Icon: Contrast },
  { key: "bw_soft", label: "B&W Soft", Icon: CircleDashed },
  { key: "bw_warm", label: "B&W Warm", Icon: Sun },
]

type Props = {
  /** The active section — drives which functions this bar exposes. */
  activeSection: EditorSection
  /** Fired when the user picks a trace kind. The shell wires this to open the
   * matching configure dialog directly. */
  onTraceKindTap?: (kind: RegisteredTraceId) => void
  /** The currently-applied trace kind, or `null` when none is set. Trace is
   * mutually exclusive — at most one kind active per project. */
  activeTraceKind?: RegisteredTraceId | null
  /** Clears the active trace. May be async — the Delete circle spins until it
   * resolves. */
  onDeleteTrace?: () => void | Promise<void>

  /** Map of filter kind → the instance id to target for delete (the last
   * applied instance of that kind). A kind is "active" iff it's a key here. */
  activeFilterByKind?: Partial<Record<RegisteredFilterId, string>>
  /** Applies a new filter of the given kind (instant — filters are param-less). */
  onApplyFilterKind?: (kind: RegisteredFilterId) => void
  /** Removes one filter instance by id. May be async (spins). */
  onRemoveFilter?: (id: string) => void | Promise<void>
  /** Disables applying new filters (no source image / busy). */
  isAddFilterDisabled?: boolean
  /** The Filter section is locked (a trace depends on the filter output) →
   * applying a new filter is disabled until the trace is removed. */
  filterLocked?: boolean

  /** A grid exists on the project (the Grid frame shows as active). */
  hasGrid?: boolean
  /** A master image exists (the Image frame shows as active). */
  hasMasterImage?: boolean
  /** Quick-creates a grid (param-free, instant) when none exists. */
  onCreateGrid?: () => void | Promise<void>
  /** Opens one of the three standalone artboard dialogs (Artboard / Grid /
   * Image). The frame the user taps selects which dialog. */
  onOpenArtboard?: (dialog: ArtboardDialog) => void
  /** The Image section is locked (a filter/trace depends on the master image) →
   * image functions (edit/resize/crop) are disabled until they are removed. */
  imageLocked?: boolean
}

export function EditorTopBar({
  activeSection,
  onTraceKindTap,
  activeTraceKind = null,
  onDeleteTrace,
  activeFilterByKind,
  onApplyFilterKind,
  onRemoveFilter,
  isAddFilterDisabled = false,
  filterLocked = false,
  hasGrid = false,
  hasMasterImage = false,
  onCreateGrid,
  onOpenArtboard,
  imageLocked = false,
}: Props) {
  // Trace: mutually exclusive. The active kind is the indicator (Edit re-opens
  // its dialog, Delete clears it); the other two are disabled. No trace → all
  // three are selectable.
  const traceItems: FabMenuItem[] = TRACE_KIND_ITEMS.map(({ key, label, Icon }) => ({
    key,
    label,
    Icon,
    active: key === activeTraceKind,
    disabled: activeTraceKind != null && key !== activeTraceKind,
    onSelect: () => onTraceKindTap?.(key),
    lead:
      key === activeTraceKind
        ? { icon: Pencil, label: "Edit trace", onClick: () => onTraceKindTap?.(key) }
        : undefined,
    onDelete: key === activeTraceKind ? () => onDeleteTrace?.() : undefined,
  }))

  // Filter: parallel. Non-active kinds stay selectable while others are active.
  const filterItems: FabMenuItem[] = FILTER_KIND_ITEMS.map(({ key, label, Icon }) => {
    const activeId = activeFilterByKind?.[key]
    const active = activeId != null
    return {
      key,
      label,
      Icon,
      active,
      disabled: isAddFilterDisabled || filterLocked,
      onSelect: () => onApplyFilterKind?.(key),
      // Delete stays available on the active filter even when a trace exists —
      // the server cascades the trace away and the shell confirms it first.
      onDelete: active && activeId ? () => onRemoveFilter?.(activeId) : undefined,
    }
  })

  // Image / artboard: the three frames are the section's tools. Image functions
  // are disabled while a filter/trace depends on the image (remove it to edit).
  const editImage = (editLabel: string, dialog: ArtboardDialog): FabMenuItem["lead"] => ({
    icon: Pencil,
    label: editLabel,
    onClick: () => onOpenArtboard?.(dialog),
    disabled: imageLocked,
  })
  const artboardItems: FabMenuItem[] = [
    {
      key: "page",
      label: "Artboard/Page",
      Icon: Frame,
      active: true, // structural — always present, so the lead slot hosts Edit
      lead: editImage("Edit artboard", "artboard"),
    },
    {
      key: "grid",
      label: "Grid",
      Icon: Grid3x3,
      active: hasGrid,
      onSelect: hasGrid ? undefined : () => onCreateGrid?.(), // instant; lock-agnostic
      lead: hasGrid ? { icon: Pencil, label: "Edit grid", onClick: () => onOpenArtboard?.("grid") } : undefined,
    },
    {
      key: "image",
      label: "Image",
      Icon: ImageIcon,
      active: hasMasterImage,
      onSelect: hasMasterImage ? undefined : () => onOpenArtboard?.("image"),
      lead: hasMasterImage ? editImage("Edit image", "image") : undefined,
    },
  ]

  const config: { items: FabMenuItem[]; deleteLabel: string } | null =
    activeSection === "trace"
      ? { items: traceItems, deleteLabel: "Delete trace" }
      : activeSection === "filter"
        ? { items: filterItems, deleteLabel: "Delete filter" }
        : activeSection === "artboard"
          ? { items: artboardItems, deleteLabel: "" }
          : null

  if (!config) return null

  return (
    // Top-right, below the theme/Eye bar (`top-3`). Right-aligned at `right-3`
    // so the frames sit under the theme toggle; the active row's Delete/Edit
    // circles flank it on the left, so nothing clips past the right edge.
    <div className="absolute top-16 right-3 z-20">
      <EditorFunctionList items={config.items} deleteLabel={config.deleteLabel} />
    </div>
  )
}
