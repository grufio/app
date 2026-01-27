"use client"

import * as React from "react"

export function ProjectEditorLayout(props: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 border-t border-border bg-muted/50">
      {props.children}
    </div>
  )
}

