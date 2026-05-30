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
  // bounded to the editor area (e.g. the mobile artboard sheet — see
  // `MobileArtboardSheet`). Inside the shell flex-col layout the bottom
  // nav sits as the next sibling AFTER this, so the overlay won't cover
  // the bar even when it uses `inset-0`.
  return (
    <div className="relative flex flex-1 border-t border-border bg-muted/50">
      {props.children}
    </div>
  )
}

