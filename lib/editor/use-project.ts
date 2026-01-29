"use client"

import { useEffect, useState } from "react"

import { createSupabaseBrowserClient } from "@/lib/supabase/browser"

export type Project = { id: string; name: string }

export function useProject(projectId: string, initialProject?: Project | null) {
  const [project, setProject] = useState<Project | null>(() => (initialProject?.id === projectId ? initialProject : null))

  useEffect(() => {
    let cancelled = false
    if (initialProject?.id === projectId) return

    const load = async () => {
      const supabase = createSupabaseBrowserClient()
      const { data, error } = await supabase.from("projects").select("name").eq("id", projectId).single()
      if (cancelled) return
      if (error) return
      setProject({ id: projectId, name: data?.name ?? "" })
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [initialProject?.id, projectId])

  return { project, setProject }
}

