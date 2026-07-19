"use client"

/**
 * Project editor layout wrapper.
 *
 * Responsibilities:
 * - Provide the main editor container styling and layout constraints.
 */
import * as React from "react"

export function ProjectEditorLayout(props: { children: React.ReactNode }) {
  // `relative` is needed for absolutely-positioned overlays that should be
  // bounded to the editor area (e.g. the mobile image sheet — see
  // `ImageSheet`) and the bottom nav (`absolute bottom-4`), which anchor to
  // this box.
  //
  // `min-h-0`: as a flex item in the shell's `flex-col` root, this box would
  // otherwise get `min-height: auto` and refuse to shrink below its content
  // (the canvas). Growing the window moved the nav down but shrinking it never
  // moved the nav back up, because the box stayed pinned at the tall canvas
  // height. `min-h-0` lets it track the viewport in both directions.
  return (
    <div className="relative flex min-h-0 flex-1 border-t border-border bg-muted/50">
      {props.children}
    </div>
  )
}

