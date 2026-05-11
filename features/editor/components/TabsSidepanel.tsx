"use client"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

// "colors" and "output" were rendered as disabled triggers until 2026-05-11.
// They were dead surface — clickable nothing, communicating an unkept
// promise. Future tabs should land via real feature work (sidebar +
// right-panel section + machine event), not as greyed-out placeholders.
export type SidepanelTab = "image" | "filter" | "trace"

export function TabsSidepanel(props: {
  activeTab: SidepanelTab
  onTabChange: (tab: SidepanelTab) => void
}) {
  const { activeTab, onTabChange } = props

  // Local sidepanel-only styling, does not affect global shadcn tabs.
  const sidePanelTabsListClass =
    "inline-grid h-8 w-fit grid-flow-col auto-cols-max gap-1 rounded-md bg-transparent p-0"
  // Active-tab colours use the inverted-foreground tokens
  // (bg-foreground / text-background) so dark mode flips automatically.
  // Hover on inactive tabs uses the explicit zinc-200 shade because the
  // `--accent` token (oklch 0.97) is too light to be visible against the
  // panel background — see docs/forms/primitives-findings.md F2.1.
  const sidePanelTabsTriggerClass =
    "h-6 rounded-sm px-2 text-xs font-medium hover:bg-zinc-200 disabled:hover:bg-transparent data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-sm data-[state=active]:hover:bg-foreground"

  return (
    <div className="border-b px-4 py-3">
      <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as SidepanelTab)}>
        <TabsList className={sidePanelTabsListClass}>
          <TabsTrigger
            value="image"
            className={sidePanelTabsTriggerClass}
            id="editor-left-tabs-trigger-image"
            aria-controls="editor-left-tabs-content-image"
          >
            Image
          </TabsTrigger>
          <TabsTrigger
            value="filter"
            className={sidePanelTabsTriggerClass}
            id="editor-left-tabs-trigger-filter"
            aria-controls="editor-left-tabs-content-filter"
          >
            Filter
          </TabsTrigger>
          <TabsTrigger
            value="trace"
            className={sidePanelTabsTriggerClass}
            id="editor-left-tabs-trigger-trace"
            aria-controls="editor-left-tabs-content-trace"
          >
            Trace
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  )
}
