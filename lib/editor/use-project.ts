"use client"

/**
 * React hook for basic project metadata.
 *
 * Responsibilities:
 * - Load the project name for the editor header.
 * - Support optional server-provided initial data to avoid waterfalls.
 */
import { useEffect, useState } from "react"

import { getProjectNameClient } from "@/services/projects/client/get-project"

export type Project = { id: string; name: string }

export function useProject(projectId: string, initialProject?: Project | null) {
  const [project, setProject] = useState<Project | null>(() => (initialProject?.id === projectId ? initialProject : null))
  const [error, setError] = useState<string>("")

  useEffect(() => {
    let cancelled = false
    if (initialProject?.id === projectId) return

    const load = async () => {
      const { name, error } = await getProjectNameClient(projectId)
      if (cancelled) return
      if (error) {
        setError(error)
        return
      }
      setError("")
      setProject({ id: projectId, name: name ?? "" })
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [initialProject?.id, projectId])

  return { project, setProject, error }
}

