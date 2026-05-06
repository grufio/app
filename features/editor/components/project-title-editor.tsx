"use client"

import { useRef, useState } from "react"

import { updateProjectTitleClient } from "@/services/projects/client/update-project-title"
import { FieldControl } from "@/components/ui/form-controls"
import { AppFieldGroup } from "@/components/ui/form-controls/field-group"

type Props = {
  projectId: string
  initialTitle?: string
  onTitleUpdated?: (nextTitle: string) => void
}

export function ProjectTitleEditor({ projectId, initialTitle, onTitleUpdated }: Props) {
  const [title, setTitle] = useState<string>(initialTitle ?? "Untitled")
  const [draft, setDraft] = useState<string>(initialTitle ?? "Untitled")
  const [isFocused, setIsFocused] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [, setError] = useState<string>("")

  const inputRef = useRef<HTMLInputElement | null>(null)
  const lastSubmittedRef = useRef<string | null>(null)

  // Sync prop change into local state without an effect — render-phase
  // detection via sentinel state is the React-blessed pattern for
  // "external prop changes should reset internal state". No cascading
  // render: React notices same setState calls in the same render and
  // restarts the render synchronously.
  const [lastSyncedInitial, setLastSyncedInitial] = useState(initialTitle)
  if (initialTitle !== lastSyncedInitial) {
    setLastSyncedInitial(initialTitle)
    if (typeof initialTitle === "string") {
      const next = initialTitle.trim() || "Untitled"
      setTitle(next)
      if (!isFocused) setDraft(next)
    }
  }

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
    <div>
      <AppFieldGroup className="border-transparent bg-transparent shadow-none hover:border-muted-foreground/30">
        <FieldControl
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="pl-2 pr-3 text-sm leading-5 font-medium"
          aria-label="Project title"
          onFocus={() => {
            setError("")
            setIsFocused(true)
            queueMicrotask(() => inputRef.current?.select())
          }}
          onMouseDown={(e) => {
            // Prevent caret placement by click, then force full selection.
            e.preventDefault()
            inputRef.current?.focus()
            queueMicrotask(() => inputRef.current?.select())
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              inputRef.current?.blur()
            }
            if (e.key === "Escape") {
              setError("")
              setDraft(title)
              inputRef.current?.blur()
            }
          }}
          onBlur={() => {
            setIsFocused(false)
            void save(draft)
          }}
        />
      </AppFieldGroup>
    </div>
  )
}
