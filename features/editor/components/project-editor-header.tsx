"use client"

import Link from "next/link"
import { ArrowLeft, PanelLeft, PanelLeftClose, PanelRight, PanelRightClose } from "lucide-react"
import { ProjectTitleEditor } from "./project-title-editor"

/**
 * Header for the project editor page.
 *
 * Features:
 * - Back link to the dashboard
 * - Header stays minimal; editor tabs live in the left sidebar
 * - Mobile-only toggles (PanelLeft / PanelRight icons) for the side
 *   panels. On `< md` both panels are hidden by default and slide in
 *   as Radix-Sheet drawers when their respective toggle fires.
 * - Left-panel toggle sits LEFT of the back arrow; right-panel toggle
 *   sits on the right edge.
 */
export function ProjectEditorHeader(props: {
  projectId: string
  initialTitle?: string
  onTitleUpdated?: (nextTitle: string) => void
  leftPanelOpen?: boolean
  onToggleLeftPanel?: () => void
  rightPanelOpen?: boolean
  onToggleRightPanel?: () => void
}) {
  return (
    <header className="flex shrink-0 items-center py-1 transition-[width,height] ease-linear">
      <div className="flex flex-1 items-center gap-2 px-4">
        {props.onToggleLeftPanel ? (
          <button
            type="button"
            aria-expanded={props.leftPanelOpen ?? false}
            aria-controls="left-panel"
            aria-label="Toggle layers panel"
            onClick={props.onToggleLeftPanel}
            className="-ml-1 inline-flex size-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground md:hidden"
          >
            {props.leftPanelOpen ? (
              <PanelLeftClose className="size-4" />
            ) : (
              <PanelLeft className="size-4" />
            )}
          </button>
        ) : null}
        <Link
          href="/dashboard"
          aria-label="Back to dashboard"
          className="-ml-1 inline-flex size-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1 max-w-md">
          <ProjectTitleEditor
            projectId={props.projectId}
            initialTitle={props.initialTitle}
            onTitleUpdated={props.onTitleUpdated}
          />
        </div>
        {props.onToggleRightPanel ? (
          <button
            type="button"
            aria-expanded={props.rightPanelOpen ?? false}
            aria-controls="right-panel"
            aria-label="Toggle info panel"
            onClick={props.onToggleRightPanel}
            className="ml-auto inline-flex size-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground md:hidden"
          >
            {props.rightPanelOpen ? (
              <PanelRightClose className="size-4" />
            ) : (
              <PanelRight className="size-4" />
            )}
          </button>
        ) : null}
      </div>
    </header>
  )
}

