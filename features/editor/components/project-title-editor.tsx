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
  const [isFocused, setIsFocused] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string>("")

  const inputRef = useRef<HTMLInputElement | null>(null)
  const lastSubmittedRef = useRef<string | null>(null)

  useEffect(() => {
    if (typeof initialTitle !== "string") return
    const next = initialTitle.trim() || "Untitled"
    setTitle(next)
    if (!isFocused) setDraft(next)
  }, [initialTitle, isFocused])

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
      <InputGroup className="border-transparent bg-transparent shadow-none hover:border-muted-foreground/30">
        <InputGroupInput
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
      </InputGroup>
    </div>
  )
}
