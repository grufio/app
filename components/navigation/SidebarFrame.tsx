"use client"

/**
 * Sidebar provider wrapper.
 *
 * Responsibilities:
 * - Provide sidebar context/state for child layouts.
 */
import * as React from "react"

import { SidebarProvider } from "@/components/ui/sidebar"

export function SidebarFrame(
  props: React.ComponentProps<typeof SidebarProvider>
) {
  return <SidebarProvider {...props} />
}

