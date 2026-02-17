"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowLeft } from "lucide-react"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

/**
 * Header for the project editor page.
 *
 * Features:
 * - Back link to the dashboard
 * - Section tabs for right-panel context
 */
export function ProjectEditorHeader() {
  const [activeTab, setActiveTab] = useState<"image" | "filter" | "colors" | "output">("image")

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
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="gap-0">
          <TabsList className="h-6 gap-2">
            <TabsTrigger value="image" className="h-6 text-[12px] leading-[24px]">
              Image
            </TabsTrigger>
            <TabsTrigger value="filter" className="h-6 text-[12px] leading-[24px]">
              Filter
            </TabsTrigger>
            <TabsTrigger value="colors" className="h-6 text-[12px] leading-[24px]">
              Colors
            </TabsTrigger>
            <TabsTrigger value="output" className="h-6 text-[12px] leading-[24px]">
              Output
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </header>
  )
}

