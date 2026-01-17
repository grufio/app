import Link from "next/link"

import { AppSidebar } from "@/components/app-sidebar"
import { ProjectPreviewCard } from "@/components/app-card-project"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

export const dynamic = "force-dynamic"

export default async function Page() {
  const supabase = await createSupabaseServerClient()
  const { data: projects } = await supabase
    .from("projects")
    .select("id,name,updated_at,status,project_images(role,file_size_bytes)")
    .order("updated_at", { ascending: false })

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex w-full items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="#">
                    Building Your Application
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Data Fetching</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <Button asChild className="ml-auto">
              <Link href="/projects/new">New project</Link>
            </Button>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {(projects ?? []).map((p) => (
              (() => {
                const images = (p as unknown as { project_images?: Array<{ role: string; file_size_bytes: unknown }> })
                  .project_images
                const master = images?.find((img) => img.role === "master")
                const bytesRaw = master?.file_size_bytes
                const bytes =
                  typeof bytesRaw === "number"
                    ? bytesRaw
                    : typeof bytesRaw === "string"
                      ? Number(bytesRaw)
                      : 0
                const fileSizeLabel = `${Math.round(bytes / 1024)} kb`
                const hasThumbnail = Boolean(master)

                return (
              <ProjectPreviewCard
                key={p.id}
                href={`/projects/${p.id}`}
                title={p.name}
                dateLabel={p.updated_at ? new Date(p.updated_at).toLocaleString() : undefined}
                statusLabel={p.status === "completed" ? "Completed" : undefined}
                {...(hasThumbnail ? { hasThumbnail: true, fileSizeLabel } : { hasThumbnail: false })}
              />
                )
              })()
            ))}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
