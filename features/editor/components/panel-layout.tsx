"use client"

/**
 * Small layout helpers for editor panels.
 *
 * Responsibilities:
 * - Provide consistent row/field/icon spacing for right-panel controls.
 */
import type { ReactNode } from "react"

export function PanelTwoFieldRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[1fr_1fr_auto] gap-3">{children}</div>
}

export function PanelField({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      {children}
    </div>
  )
}

export function PanelIconSlot({ children }: { children?: ReactNode }) {
  if (!children) return <div className="h-6 w-6" aria-hidden="true" />
  return <div className="flex items-center justify-end">{children}</div>
}

