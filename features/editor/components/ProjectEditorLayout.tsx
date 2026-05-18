"use client"

/**
 * Project editor layout wrapper.
 *
 * Responsibilities:
 * - Provide the main editor container styling and layout constraints.
 */
import * as React from "react"

export function ProjectEditorLayout(props: { children: React.ReactNode }) {
  // `relative` anchors the mobile right-panel drawer (absolute-positioned
  // on `< md`); `max-md:overflow-hidden` clips the drawer when it's
  // translated off-screen right so it can't peek past the viewport.
  return (
    <div className="relative flex flex-1 border-t border-border bg-muted/50 max-md:overflow-hidden">
      {props.children}
    </div>
  )
}

