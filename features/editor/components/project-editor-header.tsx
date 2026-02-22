"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Header for the project editor page.
 *
 * Features:
 * - Back link to the dashboard
 * - Section tabs for right-panel context
 */
export function ProjectEditorHeader() {
  const [activeTab, setActiveTab] = useState<"image" | "filter" | "colors" | "output">("image")
  const tabs: Array<{ key: typeof activeTab; label: string }> = [
    { key: "image", label: "Image" },
    { key: "filter", label: "Filter" },
    { key: "colors", label: "Colors" },
    { key: "output", label: "Output" },
  ]

  return (
    <header className="flex shrink-0 items-center py-1 transition-[width,height] ease-linear">
      <div className="flex items-center gap-2 px-4">
        <Link
          href="/dashboard"
          aria-label="Back to dashboard"
          className="-ml-1 inline-flex size-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
        >
          <ArrowLeft className="h-[16px] w-[16px]" />
        </Link>
        <div role="tablist" aria-label="Editor sections" className="inline-grid h-7 w-fit grid-flow-col auto-cols-max items-center gap-[12px] p-0">
          {tabs.map((tab) => {
            const active = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-[12px] leading-[24px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  active ? "bg-black text-white" : "bg-muted text-foreground hover:bg-muted/80"
                )}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>
    </header>
  )
}

