import Link from "next/link"
import { ImageOff } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { ProjectCardMenu } from "@/components/app-card-project-menu"
import { ProjectCardThumbnail, type ProjectThumbImageState } from "@/components/app-card-project-thumbnail"

export type ProjectPreviewCardProps = {
  projectId: string
  href: string
  title: string
  dateLabel?: string
  statusLabel?: string
  artboardWidthPx?: number
  artboardHeightPx?: number
  initialImageTransform: ProjectThumbImageState
} & (
  | {
      hasThumbnail: true
      fileSizeLabel: string
    }
  | {
      hasThumbnail?: false
      fileSizeLabel?: never
}
)

export function ProjectPreviewCard({
  projectId,
  href,
  title,
  dateLabel,
  statusLabel,
  artboardWidthPx,
  artboardHeightPx,
  initialImageTransform,
  hasThumbnail,
  fileSizeLabel,
}: ProjectPreviewCardProps) {
  const sizeText = hasThumbnail ? fileSizeLabel : "0 kb"
  const showCanvasThumb = hasThumbnail || Boolean((artboardWidthPx ?? 0) > 0 && (artboardHeightPx ?? 0) > 0)

  return (
    <div className="relative">
      {/* Keep the menu OUTSIDE the link so clicking it never navigates. */}
      <div className="absolute right-2 top-2 z-20">
        <ProjectCardMenu
          projectId={projectId}
          href={href}
          className="h-6 w-6 cursor-pointer rounded-full border border-muted-foreground/60 bg-white/80 text-foreground/70 hover:border-[#7C5CFF] hover:bg-white hover:text-foreground"
        />
      </div>

      <Link href={href} className="block">
        <Card
          className={cn(
            "gap-0 overflow-hidden py-0 transition-shadow hover:shadow-sm",
            "border border-border hover:border-violet-500"
          )}
        >
          <div className="relative aspect-[4/3] bg-muted">
            {statusLabel ? (
              <div className="absolute left-2 top-2 z-10">
                <span className="rounded-sm bg-foreground px-2 py-0.5 text-xs font-medium text-background">
                  {statusLabel}
                </span>
              </div>
            ) : null}

            {showCanvasThumb ? (
              <ProjectCardThumbnail
                projectId={projectId}
                artboardWidthPx={artboardWidthPx}
                artboardHeightPx={artboardHeightPx}
                initialImageTransform={initialImageTransform}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ImageOff className="size-5" />
              </div>
            )}
          </div>

          <CardContent className="space-y-0.5 p-3">
            <div className="line-clamp-1 text-[12px] font-semibold leading-tight">{title}</div>
            <div className="text-[12px] font-normal leading-tight text-muted-foreground">
              {sizeText}
            </div>
            {dateLabel ? (
              <div className="text-[12px] font-normal leading-tight text-muted-foreground">
                {dateLabel}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </Link>
    </div>
  )
}

