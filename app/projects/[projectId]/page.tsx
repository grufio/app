"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>()

  return (
    <div className="flex min-h-svh w-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b bg-background">
          <div className="px-4 pt-4">
            <Tabs defaultValue="tab-1">
              <TabsList>
                <TabsTrigger value="tab-1">Tab 1</TabsTrigger>
                <TabsTrigger value="tab-2">Tab 2</TabsTrigger>
                <TabsTrigger value="tab-3">Tab 3</TabsTrigger>
                <TabsTrigger value="tab-4">Tab 4</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex items-center gap-2 px-4 pb-4 pt-3">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <Button asChild size="icon" variant="ghost" aria-label="Back to dashboard">
                    <Link href="/dashboard">
                      <ArrowLeft className="size-4" />
                    </Link>
                  </Button>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="max-w-[40vw] truncate">
                    Project {params.projectId}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        <main className="flex-1 p-4">
          <div className="rounded-lg border bg-card p-4 text-card-foreground">
            <div className="text-sm text-muted-foreground">
              Placeholder detail content (DB kommt später)
            </div>
          </div>
        </main>
      </div>

      {/* Right sidebar (always visible, non-modal) */}
      <aside className="hidden h-svh w-96 shrink-0 border-l bg-background md:block">
        <div className="sticky top-0 flex h-svh flex-col">
          <div className="border-b px-4 py-3">
            <div className="text-sm font-medium">Sidebar</div>
            <div className="text-xs text-muted-foreground">
              Funktionen zum Bearbeiten (wie Illustrator)
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <div className="space-y-3">
              <div className="h-10 rounded-md bg-muted" />
              <div className="h-10 rounded-md bg-muted" />
              <div className="h-10 rounded-md bg-muted" />
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

