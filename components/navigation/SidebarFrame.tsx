"use client"

import * as React from "react"

import { SidebarProvider } from "@/components/ui/sidebar"

export function SidebarFrame(
  props: React.ComponentProps<typeof SidebarProvider>
) {
  return <SidebarProvider {...props} />
}

