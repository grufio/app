"use client"

/**
 * home bar — the Home pill (top-left). Rendered inside the shell's top-left
 * pill stack, above the view bar. Tone from the `EditorToolbarTone` context.
 */
import Link from "next/link"
import { Home } from "lucide-react"

import { useEditorToolbarTone } from "./editor-toolbar-tone"
import { pillClass } from "./floating-bar-styles"
import { ToolbarIconButton } from "./toolbar-icon-button"

export function EditorHomeBar() {
  const tone = useEditorToolbarTone()
  return (
    <div className={pillClass(tone, "single")}>
      <ToolbarIconButton label="Home" asChild>
        <Link href="/dashboard">
          <Home aria-hidden="true" className="size-6" />
        </Link>
      </ToolbarIconButton>
    </div>
  )
}
