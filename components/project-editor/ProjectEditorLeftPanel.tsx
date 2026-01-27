"use client"

import * as React from "react"

import { ProjectSidebar } from "@/components/navigation/ProjectSidebar"

export function ProjectEditorLeftPanel(props: {
  layersRoot: Parameters<typeof ProjectSidebar>[0]["root"]
  selectedNodeIdEffective: Parameters<typeof ProjectSidebar>[0]["selectedId"]
  handleSelectLayer: Parameters<typeof ProjectSidebar>[0]["onSelect"]
}) {
  const { layersRoot, selectedNodeIdEffective, handleSelectLayer } = props
  return (
    <aside className="w-96 shrink-0 border-r bg-background/80" aria-label="Layers">
      <div className="flex h-full flex-col">
        <div className="border-b px-4 py-3">
          <div className="text-sm font-medium">Layers</div>
        </div>
        <div className="flex-1 overflow-auto p-2">
          <ProjectSidebar
            root={layersRoot}
            selectedId={selectedNodeIdEffective}
            onSelect={handleSelectLayer}
          />
        </div>
      </div>
    </aside>
  )
}

