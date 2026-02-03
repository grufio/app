"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { ArrowLeft } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { updateProjectTitleClient } from "@/services/projects/client/update-project-title"

type Props = {
  projectId: string
  initialTitle?: string
  onTitleUpdated?: (nextTitle: string) => void
}

/**
 * Header for the project editor page.
 *
 * Features:
 * - Back link to the dashboard
 * - Inline editable project title (Enter/Blur to save, Escape to cancel)
 */
export function ProjectEditorHeader({ projectId, initialTitle, onTitleUpdated }: Props) {
  const [title, setTitle] = useState<string>(initialTitle ?? "Untitled")
  const [draft, setDraft] = useState<string>(initialTitle ?? "Untitled")
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string>("")
  const [activeTab, setActiveTab] = useState<"image" | "filter" | "colors" | "output">("image")

  const inputRef = useRef<HTMLInputElement | null>(null)
  const ignoreNextBlurRef = useRef(false)
  const lastSubmittedRef = useRef<string | null>(null)

  // Keep internal state in sync when parent updates initial title (e.g. after load)
  useEffect(() => {
    if (typeof initialTitle !== "string") return
    const next = initialTitle.trim() || "Untitled"
    setTitle(next)
    if (!isEditing) setDraft(next)
  }, [initialTitle, isEditing])

  useEffect(() => {
    if (!isEditing) return
    queueMicrotask(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [isEditing])

  const save = async (nextRaw: string) => {
    const next = nextRaw.trim() || "Untitled"
    setError("")

    // no-op
    if (next === title) {
      setIsEditing(false)
      setDraft(next)
      return
    }

    // prevent double submit (Enter + Blur)
    if (isSaving) return
    if (lastSubmittedRef.current === next) return
    lastSubmittedRef.current = next

    setIsSaving(true)
    try {
      const { error } = await updateProjectTitleClient({ projectId, name: next })
      if (error) {
        lastSubmittedRef.current = null
        setError(error)
        return
      }

      setTitle(next)
      setDraft(next)
      setIsEditing(false)
      onTitleUpdated?.(next)
    } finally {
      setIsSaving(false)
    }
  }

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

        {!isEditing ? (
          <button
            type="button"
            onClick={() => {
              setDraft(title)
              setIsEditing(true)
            }}
            className={cn(
              "inline-flex items-center rounded-md px-3 py-1 text-sm font-medium text-foreground",
              "hover:bg-muted"
            )}
            aria-label="Edit project title"
          >
            {title || "Untitled"}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-w-[200px]"
              aria-label="Project title"
              disabled={isSaving}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  ignoreNextBlurRef.current = true
                  void save(draft)
                }
                if (e.key === "Escape") {
                  setError("")
                  setDraft(title)
                  setIsEditing(false)
                }
              }}
              onBlur={() => {
                if (ignoreNextBlurRef.current) {
                  ignoreNextBlurRef.current = false
                  return
                }
                void save(draft)
              }}
            />
            {isSaving ? <div className="text-xs text-muted-foreground">Saving…</div> : null}
            {error ? <div className="text-xs text-destructive">{error}</div> : null}
          </div>
        )}
      </div>

      <div className="px-4">
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
      </div>
    </header>
  )
}

