"use client"

/**
 * Floating navigation bar in the top-left corner of the editor canvas.
 * Two dark Feather-style pills:
 *
 *   1. Standalone Home pill — links to `/dashboard`
 *   2. Group pill — four section icons (Image / Filter / Trace / Color)
 *      whose tap behaviour mirrors `MobileBottomNav` exactly
 *
 * This bar is the planned long-term replacement for `MobileBottomNav`.
 * Both coexist during the transition phase so the user can compare
 * the surfaces before the bottom bar gets retired in a follow-up.
 *
 * The bar is **viewport-agnostic** — mounted on both mobile and
 * desktop. On desktop it visually overlaps the left-panel sidebar;
 * that's an accepted transitional cosmetic issue, to be resolved by
 * moving the mount inside the canvas-stage in a later iteration.
 *
 * "Image" label vs `artboard` section key: the `MobileSection` tuple
 * (`["artboard", "filter", "trace", "colors"]`) is unchanged — only
 * the user-facing label says "Image". Renaming the key would ripple
 * through `mobile-sections.ts` plus the display-layer plumbing, out
 * of scope for this bar.
 *
 * Trace and Filter each get a floating "+" kind-menu (`SectionFabMenu`),
 * shown only while their section is active. Trace is mutually exclusive
 * (one kind, Edit + Delete on the active row). Filter is parallel: kinds
 * stay selectable while others are active, applying is instant (no dialog),
 * and the active row's LEFT flank hosts an Unlock action when the section
 * is locked (a trace exists) instead of an Edit pencil.
 */
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import {
  CircleDashed,
  CircleDot,
  Contrast,
  Frame,
  Grid2x2,
  Grid3x3,
  Home,
  Image as ImageIcon,
  Loader2,
  Palette,
  Pencil,
  SlidersHorizontal,
  Spline,
  Sun,
  Unlock,
  type LucideIcon,
} from "lucide-react"

import type { RegisteredFilterId } from "@/lib/editor/filters/registry"
import type { MobileSection } from "@/lib/editor/mobile-sections"
import type { RegisteredTraceId } from "@/lib/editor/trace/registry"

import { useEditorToolbarTone } from "./editor-toolbar-tone"
import { pillClass } from "./floating-bar-styles"
import { SectionFabMenu, type FabMenuItem } from "./section-fab-menu"
import { ToolbarIconButton } from "./toolbar-icon-button"

type SectionItem = {
  key: MobileSection
  label: string
  Icon: LucideIcon
}

const SECTION_ITEMS: SectionItem[] = [
  { key: "artboard", label: "Image", Icon: Frame },
  { key: "filter", label: "Filter", Icon: SlidersHorizontal },
  { key: "trace", label: "Trace", Icon: Grid3x3 },
  { key: "colors", label: "Color", Icon: Palette },
]

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
  activeSection?: MobileSection | null
  onSectionTap?: (section: MobileSection) => void
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
   * applied instance of that kind). A kind is "active" iff it's a key here.
   * Filters are parallel: multiple kinds can be active at once. */
  activeFilterByKind?: Partial<Record<RegisteredFilterId, string>>
  /** Applies a new filter of the given kind (instant — filters are param-less). */
  onApplyFilterKind?: (kind: RegisteredFilterId) => void
  /** Removes one filter instance by id. May be async (spins). */
  onRemoveFilter?: (id: string) => void | Promise<void>
  /** Disables applying new filters (no source image / busy). */
  isAddFilterDisabled?: boolean
  /** The Filter section is locked (a trace depends on the filter output). When
   * locked, active rows show Unlock instead of Delete and applies are blocked. */
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
  /** Opens the artboard sheet (the full Page/Artboard/Grid/Image editor). */
  onOpenArtboard?: () => void
  /** The Image section is locked (a filter/trace depends on the master image).
   * When locked the Artboard/Page + Image rows show Unlock instead of Edit.
   * Grid is exempt (independent of the image pipeline). */
  imageLocked?: boolean
  /** Runs the image unlock action (clears the dependency). */
  onUnlockImage?: () => void
  /** Image unlock is in flight (disables the Unlock circle). */
  unlockImageBusy?: boolean
  /** A filter apply is in flight — the Filter section icon shows a spinner. */
  isApplyingFilter?: boolean
}

export function EditorTopLeftBar({
  activeSection = null,
  onSectionTap,
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
  const [traceSubOpen, setTraceSubOpen] = useState(false)
  const [filterSubOpen, setFilterSubOpen] = useState(false)
  const [artboardSubOpen, setArtboardSubOpen] = useState(false)
  const traceWrapperRef = useRef<HTMLDivElement>(null)
  const filterWrapperRef = useRef<HTMLDivElement>(null)
  const artboardWrapperRef = useRef<HTMLDivElement>(null)
  const tone = useEditorToolbarTone()

  // Each "+" menu only exists while its section is active. Collapse an open
  // menu when navigating away so returning shows the + closed.
  useEffect(() => {
    if (activeSection !== "trace" && traceSubOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTraceSubOpen(false)
    }
  }, [activeSection, traceSubOpen])
  useEffect(() => {
    if (activeSection !== "filter" && filterSubOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFilterSubOpen(false)
    }
  }, [activeSection, filterSubOpen])
  useEffect(() => {
    if (activeSection !== "artboard" && artboardSubOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setArtboardSubOpen(false)
    }
  }, [activeSection, artboardSubOpen])

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
  // Active rows show Delete when unlocked, or an Unlock circle when the section
  // is locked (a trace depends on the filters).
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

  // Image / artboard: the three frames are the section's tools, not apply-able
  // kinds. They launch the artboard sheet (the full editor) and show glanceable
  // state; Grid quick-creates when empty. When the section is locked (a
  // filter/trace depends on the master image) the Artboard/Page + Image rows
  // swap Edit → Unlock; Grid is exempt (independent of the image pipeline).
  const openArtboardSheet = () => {
    onOpenArtboard?.()
    setArtboardSubOpen(false) // collapse the menu as the sheet takes over
  }
  const editOrUnlock = (editLabel: string): FabMenuItem["lead"] =>
    imageLocked
      ? { icon: Unlock, label: "Unlock image", onClick: onUnlockImage, disabled: unlockImageBusy }
      : { icon: Pencil, label: editLabel, onClick: openArtboardSheet }
  const artboardItems: FabMenuItem[] = [
    {
      key: "page",
      label: "Artboard/Page",
      Icon: Frame,
      active: true, // structural — always present, so the lead slot can host Unlock
      lead: editOrUnlock("Edit artboard"),
    },
    {
      key: "grid",
      label: "Grid",
      Icon: Grid3x3,
      active: hasGrid,
      onSelect: hasGrid ? undefined : () => onCreateGrid?.(), // instant; lock-agnostic
      lead: hasGrid ? { icon: Pencil, label: "Edit grid", onClick: openArtboardSheet } : undefined,
    },
    {
      key: "image",
      label: "Image",
      Icon: ImageIcon,
      active: hasMasterImage,
      onSelect: hasMasterImage ? undefined : openArtboardSheet, // (no image ⇒ not locked) upload via sheet
      lead: hasMasterImage ? editOrUnlock("Edit image") : undefined,
    },
  ]

  return (
    <div className="absolute top-3 left-3 z-20 flex items-center gap-3">
      <div className={pillClass(tone, "single")}>
        <ToolbarIconButton label="Home" asChild>
          <Link href="/dashboard">
            <Home aria-hidden="true" className="size-6" />
          </Link>
        </ToolbarIconButton>
      </div>
      <div className={pillClass(tone, "group")}>
        {SECTION_ITEMS.map(({ key, label, Icon }) => {
          if (key === "trace") {
            return (
              <div key={key} ref={traceWrapperRef} className="relative">
                {/* The Trace icon only navigates to the trace section; the kind
                    menu is driven by the separate + circle below. */}
                <ToolbarIconButton
                  label={label}
                  active={activeSection === "trace"}
                  onClick={() => onSectionTap?.(key)}
                >
                  <Icon aria-hidden="true" className="size-6" />
                </ToolbarIconButton>
                {activeSection === "trace" && (
                  <SectionFabMenu
                    open={traceSubOpen}
                    onOpenChange={setTraceSubOpen}
                    containerRef={traceWrapperRef}
                    items={traceItems}
                    labels={{ add: "Add trace", close: "Close trace menu" }}
                    deleteLabel="Delete trace"
                    closeOnSelect
                    closeOnDelete
                  />
                )}
              </div>
            )
          }
          if (key === "filter") {
            return (
              <div key={key} ref={filterWrapperRef} className="relative">
                {/* Dimmed (but still tappable) while locked — unlock lives in
                    the "+" menu's Unlock lead. Spinner while a filter applies. */}
                <ToolbarIconButton
                  label={label}
                  active={activeSection === "filter"}
                  onClick={() => onSectionTap?.(key)}
                  className={filterLocked ? "opacity-40" : undefined}
                >
                  {isApplyingFilter ? (
                    <Loader2 aria-hidden="true" className="size-6 animate-spin" />
                  ) : (
                    <Icon aria-hidden="true" className="size-6" />
                  )}
                </ToolbarIconButton>
                {activeSection === "filter" && (
                  <SectionFabMenu
                    open={filterSubOpen}
                    onOpenChange={setFilterSubOpen}
                    containerRef={filterWrapperRef}
                    items={filterItems}
                    labels={{ add: "Add filter", close: "Close filter menu" }}
                    deleteLabel="Delete filter"
                  />
                )}
              </div>
            )
          }
          if (key === "artboard") {
            return (
              <div key={key} ref={artboardWrapperRef} className="relative">
                {/* Dimmed (but still tappable) while the image is locked —
                    unlock lives in the "+" menu's Unlock lead. */}
                <ToolbarIconButton
                  label={label}
                  active={activeSection === "artboard"}
                  onClick={() => onSectionTap?.(key)}
                  className={imageLocked ? "opacity-40" : undefined}
                >
                  <Icon aria-hidden="true" className="size-6" />
                </ToolbarIconButton>
                {activeSection === "artboard" && (
                  <SectionFabMenu
                    open={artboardSubOpen}
                    onOpenChange={setArtboardSubOpen}
                    containerRef={artboardWrapperRef}
                    items={artboardItems}
                    labels={{ add: "Add to artboard", close: "Close artboard menu" }}
                    deleteLabel=""
                  />
                )}
              </div>
            )
          }
          return (
            <ToolbarIconButton
              key={key}
              label={label}
              active={key === activeSection}
              onClick={() => onSectionTap?.(key)}
            >
              <Icon aria-hidden="true" className="size-6" />
            </ToolbarIconButton>
          )
        })}
      </div>
    </div>
  )
}
