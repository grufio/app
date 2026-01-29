/**
 * Dashboard page route.
 *
 * Responsibilities:
 * - Server-render the project list for the signed-in user.
 * - Provide entrypoints for creating and opening projects.
 */
import { AppSidebarMain } from "@/components/navigation/AppSidebarMain"
import { ProjectPreviewCard } from "@/components/app-card-project"
import { CreateProjectDialog } from "@/app/dashboard/create-project-dialog"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { SidebarFrame } from "@/components/navigation/SidebarFrame"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { listDashboardProjects } from "@/services/projects"

export const dynamic = "force-dynamic"

export default async function Page() {
  const supabase = await createSupabaseServerClient()
  const { projects, error } = await listDashboardProjects(supabase)
  if (error) throw new Error(`Failed to load projects: ${error}`)

  return (
    <SidebarFrame>
      <AppSidebarMain />
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

            <CreateProjectDialog />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {(projects ?? []).map((row) => {
              return (
                <ProjectPreviewCard
                  key={row.id}
                  projectId={row.id}
                  href={row.href}
                  title={row.title}
                  dateLabel={row.dateLabel}
                  statusLabel={row.statusLabel}
                  artboardWidthPx={row.artboardWidthPx}
                  artboardHeightPx={row.artboardHeightPx}
                  thumbUrl={row.thumbUrl}
                  initialImageTransform={row.initialImageTransform}
                  {...(row.hasThumbnail ? { hasThumbnail: true, fileSizeLabel: row.fileSizeLabel ?? "0 kb" } : { hasThumbnail: false })}
                />
              )
            })}
          </div>
        </div>
      </SidebarInset>
    </SidebarFrame>
  )
}
