"use client"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export type SidepanelTab = "image" | "filter" | "colors" | "output"

export function TabsSidepanel(props: {
  activeTab: SidepanelTab
  onTabChange: (tab: SidepanelTab) => void
}) {
  const { activeTab, onTabChange } = props

  // Local sidepanel-only styling, does not affect global shadcn tabs.
  const sidePanelTabsListClass =
    "inline-grid h-8 w-fit grid-flow-col auto-cols-max gap-1 rounded-md bg-muted/60 p-1"
  const sidePanelTabsTriggerClass =
    "h-6 rounded-sm px-2 text-xs font-medium data-[state=active]:bg-black data-[state=active]:text-white data-[state=active]:shadow-sm"

  return (
    <div className="border-b px-4 py-3">
      <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as SidepanelTab)}>
        <TabsList className={sidePanelTabsListClass}>
          <TabsTrigger value="image" className={sidePanelTabsTriggerClass}>
            Image
          </TabsTrigger>
          <TabsTrigger value="filter" className={sidePanelTabsTriggerClass}>
            Filter
          </TabsTrigger>
          <TabsTrigger value="colors" className={sidePanelTabsTriggerClass} disabled>
            Colors
          </TabsTrigger>
          <TabsTrigger value="output" className={sidePanelTabsTriggerClass} disabled>
            Output
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  )
}
