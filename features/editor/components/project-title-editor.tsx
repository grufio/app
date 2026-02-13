"use client"

import { useEffect, useRef, useState } from "react"

import { updateProjectTitleClient } from "@/services/projects/client/update-project-title"
import { InputGroup, InputGroupInput } from "@/components/ui/input-group"

type Props = {
  projectId: string
  initialTitle?: string
  onTitleUpdated?: (nextTitle: string) => void
}

export function ProjectTitleEditor({ projectId, initialTitle, onTitleUpdated }: Props) {
  const [title, setTitle] = useState<string>(initialTitle ?? "Untitled")
  const [draft, setDraft] = useState<string>(initialTitle ?? "Untitled")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string>("")

  const inputRef = useRef<HTMLInputElement | null>(null)
  const ignoreNextBlurRef = useRef(false)
  const lastSubmittedRef = useRef<string | null>(null)

  useEffect(() => {
    if (typeof initialTitle !== "string") return
    const next = initialTitle.trim() || "Untitled"
    setTitle(next)
    setDraft(next)
  }, [initialTitle])

  const save = async (nextRaw: string) => {
    const next = nextRaw.trim() || "Untitled"
    setError("")

    if (next === title) {
      setDraft(next)
      return
    }

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
      onTitleUpdated?.(next)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-1">
      <InputGroup>
        <InputGroupInput
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="text-sm font-medium"
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
      </InputGroup>
      {isSaving ? <div className="text-xs text-muted-foreground">Saving…</div> : null}
      {error ? <div className="text-xs text-destructive">{error}</div> : null}
    </div>
  )
}
