"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import type { Unit } from "@/lib/editor/units"
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

type Preset = {
  id: string
  label: string
  unit: Unit
  width_value: number
  height_value: number
  group: "print" | "web"
}

const PRESETS: Preset[] = [
  { id: "print-a4", label: "A4 (210 × 297 mm)", unit: "mm", width_value: 210, height_value: 297, group: "print" },
  { id: "print-a3", label: "A3 (297 × 420 mm)", unit: "mm", width_value: 297, height_value: 420, group: "print" },
  { id: "web-1920x1080", label: "Web 1920 × 1080 px", unit: "px", width_value: 1920, height_value: 1080, group: "web" },
  { id: "web-1280x720", label: "Web 1280 × 720 px", unit: "px", width_value: 1280, height_value: 720, group: "web" },
  { id: "web-1080x1080", label: "Web 1080 × 1080 px", unit: "px", width_value: 1080, height_value: 1080, group: "web" },
]

const DPI_OPTIONS = [300, 150, 72] as const

export function CreateProjectDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const [presetId, setPresetId] = useState<string>(PRESETS[0]?.id ?? "")
  const [dpi, setDpi] = useState<string>("300")

  const preset = useMemo(() => PRESETS.find((p) => p.id === presetId) ?? null, [presetId])

  const create = async () => {
    if (!preset) return
    setBusy(true)
    setError("")
    try {
      const res = await fetch("/api/projects/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Untitled",
          unit: preset.unit,
          width_value: preset.width_value,
          height_value: preset.height_value,
          dpi: Number(dpi),
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Create failed (${res.status})`)
      }
      const json = (await res.json()) as { id?: string }
      if (!json?.id) throw new Error("Create failed: missing project id")
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
                {PRESETS.filter((p) => p.group === "print").map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Web</SelectLabel>
                {PRESETS.filter((p) => p.group === "web").map((p) => (
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
              {DPI_OPTIONS.map((v) => (
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

