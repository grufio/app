"use client"

/**
 * Project editor route error boundary UI.
 *
 * Responsibilities:
 * - Render a recovery screen for project editor route errors.
 */
import { useEffect } from "react"

import { Button } from "@/components/ui/button"
import { reportError } from "@/lib/monitoring/error-reporting"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Project editor route error:", error)
    void reportError(error, { tags: { route: "project-editor" } })
  }, [error])

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-muted/50 px-6">
      <div className="w-full max-w-lg rounded-lg border bg-background p-6">
        <div className="text-base font-medium">Something went wrong</div>
        <div className="mt-2 text-sm text-muted-foreground">
          The editor hit an unexpected error. You can try again, or reload the page.
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Button type="button" onClick={() => reset()}>
            Try again
          </Button>
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    </div>
  )
}

