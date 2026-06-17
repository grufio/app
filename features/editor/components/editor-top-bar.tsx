"use client"

/**
 * Floating **functions** bar in the top-left corner of the editor canvas —
 * the contextual toolbar for whichever section is active. It shows the active
 * section's icon as a static context chip, with that section's floating "+"
 * kind-menu (`SectionFabMenu`) dropping beneath it:
 *
 *   - Trace  → the three trace kinds (mutually exclusive; Edit + Delete on the
 *     active row)
 *   - Filter → the three filter kinds (parallel; instant apply; Unlock on the
 *     active row while the section is locked)
 *   - Image/Artboard → the three frames (Artboard/Page, Grid, Image), each
 *     launching its standalone dialog; Grid quick-creates when empty
 *   - Colors → no menu (read-only palette), just the context chip
 *
 * Section *switching* lives in `EditorBottomNav` (bottom of the canvas); this
 * bar never changes the active section — it only exposes the active section's
 * functions. Ported from the former combined `EditorTopLeftBar`.
 */
import { useEffect, useRef, useState } from "react"
import {
  CircleDashed,
  CircleDot,
  Contrast,
  Frame,
  Grid2x2,
  Grid3x3,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Spline,
  Sun,
  Unlock,
  type LucideIcon,
} from "lucide-react"

import type { RegisteredFilterId } from "@/lib/editor/filters/registry"
import type { ArtboardDialog, EditorSection } from "@/lib/editor/editor-sections"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"
import { cn } from "@/lib/utils"

import { SECTION_ITEMS } from "./editor-section-items"
import { useEditorToolbarTone } from "./editor-toolbar-tone"
import { ICON_TONE, pillClass } from "./floating-bar-styles"
import { SectionFabMenu, type FabMenuItem } from "./section-fab-menu"

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

/** Resolved config for a section's "+" menu. */
type SectionMenuConfig = {
  items: FabMenuItem[]
  labels: { add: string; close: string }
  deleteLabel: string
  closeOnSelect?: boolean
  closeOnDelete?: boolean
}

type Props = {
  /** The active section — drives which functions this bar exposes. */
  activeSection: EditorSection
  /** Fired when the user picks a trace kind from the menu. The shell wires
   * this to open the matching configure dialog directly. */
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
  /** The Filter section is locked (a trace depends on the filter output). */
  filterLocked?: boolean
  /** Runs the unlock action (clears the dependency). */
  onUnlockFilter?: () => void
  /** Unlock is in flight (disables the Unlock circle). */
  unlockBusy?: boolean

  /** A grid exists on the project (the Grid frame shows as active). */
  hasGrid?: boolean
  /** A master image exists (the Image frame shows as active). */
  hasMasterImage?: boolean
  /** Quick-creates a grid (param-free, instant) when none exists. */
  onCreateGrid?: () => void | Promise<void>
  /** Opens one of the three standalone artboard dialogs (Artboard / Grid /
   * Image). The frame the user taps selects which dialog. */
  onOpenArtboard?: (dialog: ArtboardDialog) => void
  /** The Image section is locked (a filter/trace depends on the master image). */
  imageLocked?: boolean
  /** Runs the image unlock action (clears the dependency). */
  onUnlockImage?: () => void
  /** Image unlock is in flight (disables the Unlock circle). */
  unlockImageBusy?: boolean
  /** A filter apply is in flight — the Filter context chip shows a spinner. */
  isApplyingFilter?: boolean
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
  onUnlockFilter,
  unlockBusy = false,
  hasGrid = false,
  hasMasterImage = false,
  onCreateGrid,
  onOpenArtboard,
  imageLocked = false,
  onUnlockImage,
  unlockImageBusy = false,
  isApplyingFilter = false,
}: Props) {
  const tone = useEditorToolbarTone()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // The "+" menu belongs to the active section; collapse it whenever the
  // section changes so returning shows the trigger closed.
  useEffect(() => {
    setOpen(false)
  }, [activeSection])

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
      lead:
        active && filterLocked
          ? { icon: Unlock, label: "Unlock filters", onClick: onUnlockFilter, disabled: unlockBusy }
          : undefined,
      onDelete: active && !filterLocked && activeId ? () => onRemoveFilter?.(activeId) : undefined,
    }
  })

  // Image / artboard: the three frames are the section's tools. Built per-render
  // with the menu's own `close` so opening a dialog collapses the "+" menu.
  const buildArtboardItems = (close: () => void): FabMenuItem[] => {
    const openDialog = (dialog: ArtboardDialog) => () => {
      onOpenArtboard?.(dialog)
      close() // collapse the menu as the dialog takes over
    }
    const editOrUnlock = (editLabel: string, dialog: ArtboardDialog): FabMenuItem["lead"] =>
      imageLocked
        ? { icon: Unlock, label: "Unlock image", onClick: onUnlockImage, disabled: unlockImageBusy }
        : { icon: Pencil, label: editLabel, onClick: openDialog(dialog) }
    return [
      {
        key: "page",
        label: "Artboard/Page",
        Icon: Frame,
        active: true, // structural — always present, so the lead slot can host Unlock
        lead: editOrUnlock("Edit artboard", "artboard"),
      },
      {
        key: "grid",
        label: "Grid",
        Icon: Grid3x3,
        active: hasGrid,
        onSelect: hasGrid ? undefined : () => onCreateGrid?.(), // instant; lock-agnostic
        lead: hasGrid ? { icon: Pencil, label: "Edit grid", onClick: openDialog("grid") } : undefined,
      },
      {
        key: "image",
        label: "Image",
        Icon: ImageIcon,
        active: hasMasterImage,
        onSelect: hasMasterImage ? undefined : openDialog("image"), // (no image ⇒ not locked) upload via dialog
        lead: hasMasterImage ? editOrUnlock("Edit image", "image") : undefined,
      },
    ]
  }

  const config: SectionMenuConfig | null =
    activeSection === "trace"
      ? {
          items: traceItems,
          labels: { add: "Add trace", close: "Close trace menu" },
          deleteLabel: "Delete trace",
          closeOnSelect: true,
          closeOnDelete: true,
        }
      : activeSection === "filter"
        ? {
            items: filterItems,
            labels: { add: "Add filter", close: "Close filter menu" },
            deleteLabel: "Delete filter",
          }
        : activeSection === "artboard"
          ? {
              items: buildArtboardItems(() => setOpen(false)),
              labels: { add: "Add to artboard", close: "Close artboard menu" },
              deleteLabel: "",
            }
          : null

  const sectionItem = SECTION_ITEMS.find((item) => item.key === activeSection)
  if (!sectionItem) return null
  const { Icon } = sectionItem
  // Dim the context chip while the section is locked, mirroring the former bar.
  const dimmed =
    (activeSection === "filter" && filterLocked) || (activeSection === "artboard" && imageLocked)

  return (
    <div className="absolute top-3 left-3 z-20">
      <div ref={wrapperRef} className="relative">
        <div className={pillClass(tone, "single")}>
          {/* Decorative context chip — which section's functions these are.
              The labelled, interactive section affordance lives in the bottom
              nav; here it's purely visual (and avoids a duplicate "Image"
              accessible name vs the artboard menu's Image frame). */}
          <span
            aria-hidden="true"
            data-testid="editor-top-bar-context"
            className={cn(
              "flex size-8 items-center justify-center",
              ICON_TONE[tone].active,
              dimmed && "opacity-40",
            )}
          >
            {activeSection === "filter" && isApplyingFilter ? (
              <Loader2 aria-hidden="true" className="size-6 animate-spin" />
            ) : (
              <Icon aria-hidden="true" className="size-6" />
            )}
          </span>
        </div>
        {config ? (
          <SectionFabMenu
            open={open}
            onOpenChange={setOpen}
            containerRef={wrapperRef}
            items={config.items}
            labels={config.labels}
            deleteLabel={config.deleteLabel}
            closeOnSelect={config.closeOnSelect}
            closeOnDelete={config.closeOnDelete}
          />
        ) : null}
      </div>
    </div>
  )
}
