"use client"

import * as React from "react"

import { LayersMenu } from "@/components/shared/editor"

export function ProjectSidebar({
  root,
  selectedId,
  onSelect,
}: React.ComponentProps<typeof LayersMenu>) {
  return <LayersMenu root={root} selectedId={selectedId} onSelect={onSelect} />
}

