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
import { parseBigIntString } from "@/lib/editor/imageState"
import type { Database } from "@/lib/supabase/database.types"

export const dynamic = "force-dynamic"

type DashboardProjectRow = Pick<
  Database["public"]["Tables"]["projects"]["Row"],
  "id" | "name" | "updated_at" | "status"
> & {
  project_images: Array<Pick<Database["public"]["Tables"]["project_images"]["Row"], "role" | "file_size_bytes">>
  project_workspace: Pick<Database["public"]["Tables"]["project_workspace"]["Row"], "width_px" | "height_px"> | null
  project_image_state: Array<
    Pick<
      Database["public"]["Tables"]["project_image_state"]["Row"],
      "role" | "x_px_u" | "y_px_u" | "width_px_u" | "height_px_u" | "rotation_deg"
    >
  >
}

export default async function Page() {
  const supabase = await createSupabaseServerClient()
  const { data: projects, error } = await supabase
    .from("projects")
    .select(
      "id,name,updated_at,status,project_images(role,file_size_bytes),project_workspace(width_px,height_px),project_image_state(role,x_px_u,y_px_u,width_px_u,height_px_u,rotation_deg)"
    )
    .order("updated_at", { ascending: false })
    .limit(100)
    .returns<DashboardProjectRow[]>()

  if (error) throw new Error(`Failed to load projects: ${error.message}`)

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
              const master = row.project_images?.find((img) => img.role === "master") ?? null
              const bytes = master?.file_size_bytes ?? 0
              const fileSizeLabel = `${Math.round(bytes / 1024)} kb`
              const hasThumbnail = Boolean(master)

              const artboardWidthPx = row.project_workspace?.width_px
              const artboardHeightPx = row.project_workspace?.height_px

              const st = row.project_image_state?.find((s) => s.role === "master") ?? null
              const initialImageTransform = st
                ? {
                    rotationDeg: Number(st.rotation_deg ?? 0),
                    xPxU: parseBigIntString(st.x_px_u) ?? undefined,
                    yPxU: parseBigIntString(st.y_px_u) ?? undefined,
                    widthPxU: parseBigIntString(st.width_px_u) ?? undefined,
                    heightPxU: parseBigIntString(st.height_px_u) ?? undefined,
                  }
                : null

              return (
                <ProjectPreviewCard
                  key={row.id}
                  projectId={row.id}
                  href={`/projects/${row.id}`}
                  title={row.name}
                  dateLabel={row.updated_at ? new Date(row.updated_at).toLocaleString() : undefined}
                  statusLabel={row.status === "completed" ? "Completed" : undefined}
                  artboardWidthPx={artboardWidthPx}
                  artboardHeightPx={artboardHeightPx}
                  initialImageTransform={initialImageTransform}
                  {...(hasThumbnail ? { hasThumbnail: true, fileSizeLabel } : { hasThumbnail: false })}
                />
              )
            })}
          </div>
        </div>
      </SidebarInset>
    </SidebarFrame>
  )
}
