import Link from "next/link"
import { ImageOff } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"

export type ProjectPreviewCardProps = {
  href: string
  title: string
  dateLabel?: string
  statusLabel?: string
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
  href,
  title,
  dateLabel,
  statusLabel,
  hasThumbnail,
  fileSizeLabel,
}: ProjectPreviewCardProps) {
  const sizeText = hasThumbnail ? fileSizeLabel : "0 kb"

  return (
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

          {hasThumbnail ? (
            <div className="h-full w-full bg-muted/50" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImageOff className="size-5" />
            </div>
          )}
        </div>

        <CardContent className="space-y-0.5 p-3">
          <div className="line-clamp-1 text-sm font-semibold leading-tight">
            {title}
          </div>
            <div className="text-sm font-normal leading-tight text-muted-foreground">
            {sizeText}
            </div>
          {dateLabel ? (
            <div className="text-sm font-normal leading-tight text-muted-foreground">
              {dateLabel}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  )
}

