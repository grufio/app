"use client"

import { useEffect } from "react"

import { Button } from "@/components/ui/button"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("App route error:", error)
  }, [error])

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-muted/50 px-6">
      <div className="w-full max-w-lg rounded-lg border bg-background p-6">
        <div className="text-base font-medium">Something went wrong</div>
        <div className="mt-2 text-sm text-muted-foreground">The app hit an unexpected error.</div>
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

