"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { ProjectTitleEditor } from "./project-title-editor"

/**
 * Header for the project editor page.
 *
 * Features:
 * - Back link to the dashboard
 * - Section tabs for right-panel context
 */
export function ProjectEditorHeader({
  projectId,
  initialTitle,
  onTitleUpdated,
}: {
  projectId: string
  initialTitle?: string
  onTitleUpdated?: (nextTitle: string) => void
}) {
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
        <div className="min-w-0 w-56">
          <ProjectTitleEditor projectId={projectId} initialTitle={initialTitle} onTitleUpdated={onTitleUpdated} />
        </div>
      </div>
    </header>
  )
}

