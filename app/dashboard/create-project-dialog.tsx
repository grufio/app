"use client"

/**
 * Create-project dialog (dashboard).
 *
 * Responsibilities:
 * - Collect artboard preset and DPI.
 * - Call the project creation API and navigate to the new project.
 */
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Dialog, DialogTrigger } from "@/components/ui/dialog"
import { DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createProjectClient } from "@/services/projects/client/create-project"
import {
  PROJECT_DPI_OPTIONS,
  PROJECT_PRESETS,
  getProjectPresetById,
  getProjectPresetsByGroup,
} from "@/services/projects/presets"

export function CreateProjectDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const [presetId, setPresetId] = useState<string>(PROJECT_PRESETS[0]?.id ?? "")
  const [dpi, setDpi] = useState<string>("300")

  const preset = useMemo(() => getProjectPresetById(presetId), [presetId])

  const create = async () => {
    if (!preset) return
    setBusy(true)
    setError("")
    try {
      const json = await createProjectClient({
        name: "Untitled",
        unit: preset.unit,
        width_value: preset.width_value,
        height_value: preset.height_value,
        dpi: Number(dpi),
      })
      router.push(`/projects/${json.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create project")
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (busy ? null : setOpen(o))}>
      <DialogTrigger asChild>
        <Button type="button" className="ml-auto">
          New project
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>Choose an artboard preset and resolution.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Select value={presetId} onValueChange={setPresetId}>
            <SelectTrigger aria-label="Artboard preset">
              <SelectValue placeholder="Choose size" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Print</SelectLabel>
                {getProjectPresetsByGroup("print").map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Web</SelectLabel>
                {getProjectPresetsByGroup("web").map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select value={dpi} onValueChange={setDpi}>
            <SelectTrigger aria-label="Resolution (DPI)">
              <SelectValue placeholder="Choose DPI" />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_DPI_OPTIONS.map((v) => (
                <SelectItem key={String(v)} value={String(v)}>
                  {v} dpi
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {error ? <div className="text-sm text-destructive">{error}</div> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={create} disabled={busy || !preset}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

