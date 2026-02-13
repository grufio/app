"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowLeft } from "lucide-react"

import { Separator } from "@/components/ui/separator"
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
  const [tabsMounted, setTabsMounted] = useState(false)

  useEffect(() => {
    setTabsMounted(true)
  }, [])

  return (
    <header className="flex min-h-16 shrink-0 flex-col gap-2 py-3 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:min-h-12 group-has-data-[collapsible=icon]/sidebar-wrapper:py-2">
      <div className="flex items-center gap-2 px-4">
        <Link
          href="/dashboard"
          aria-label="Back to dashboard"
          className="-ml-1 inline-flex size-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
        >
          <ArrowLeft className="h-[16px] w-[16px]" />
        </Link>

        <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
      </div>

      <div className="px-4">
        {tabsMounted ? (
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
        ) : null}
      </div>
    </header>
  )
}

