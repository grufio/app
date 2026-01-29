"use client"

/**
 * Project editor layout wrapper.
 *
 * Responsibilities:
 * - Provide the main editor container styling and layout constraints.
 */
import * as React from "react"

export function ProjectEditorLayout(props: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 border-t border-border bg-muted/50">
      {props.children}
    </div>
  )
}

