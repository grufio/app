import { AppSidebar } from "@/components/app-sidebar"
import { ProjectPreviewCard } from "@/components/app-card-project"
import { CreateProjectDialog } from "@/app/dashboard/create-project-dialog"
import { createSupabaseServerClient } from "@/lib/supabase/server"
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
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

export const dynamic = "force-dynamic"

export default async function Page() {
  const supabase = await createSupabaseServerClient()
  const { data: projects } = await supabase
    .from("projects")
    .select(
      "id,name,updated_at,status,project_images(role,file_size_bytes),project_workspace(width_px,height_px),project_image_state(role,x_px_u,y_px_u,width_px_u,height_px_u,rotation_deg)"
    )
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

            <CreateProjectDialog />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {(projects ?? []).map((p) => (
              (() => {
                const row = p as unknown as {
                  id: string
                  name: string
                  updated_at?: string | null
                  status?: string | null
                  project_images?: Array<{ role: string; file_size_bytes: unknown }>
                  project_workspace?: { width_px?: unknown; height_px?: unknown } | null
                  project_image_state?: Array<{
                    role: string
                    x_px_u?: unknown
                    y_px_u?: unknown
                    width_px_u?: unknown
                    height_px_u?: unknown
                    rotation_deg: unknown
                  }>
                }

                const images = row.project_images
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

                const wsW = row.project_workspace?.width_px
                const wsH = row.project_workspace?.height_px
                const artboardWidthPx = typeof wsW === "number" ? wsW : typeof wsW === "string" ? Number(wsW) : undefined
                const artboardHeightPx = typeof wsH === "number" ? wsH : typeof wsH === "string" ? Number(wsH) : undefined

                const st = row.project_image_state?.find((s) => s.role === "master") ?? null
                const initialImageTransform = st
                  ? {
                      rotationDeg: Number(st.rotation_deg),
                      xPxU: typeof st.x_px_u === "string" ? BigInt(st.x_px_u) : undefined,
                      yPxU: typeof st.y_px_u === "string" ? BigInt(st.y_px_u) : undefined,
                      widthPxU: typeof st.width_px_u === "string" ? BigInt(st.width_px_u) : undefined,
                      heightPxU: typeof st.height_px_u === "string" ? BigInt(st.height_px_u) : undefined,
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
              })()
            ))}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
