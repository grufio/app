"use client"

import { ImageOff } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type FilterTypeCardItem = {
  id: string
  label: string
  thumbUrl?: string | null
}

export function FilterTypeCards(props: {
  items: FilterTypeCardItem[]
  onSelect?: (id: string) => void
  selectedId?: string | null
  className?: string
}) {
  const { items, onSelect, selectedId, className } = props

  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", className)}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="appearance-none border-0 bg-transparent p-0 text-left outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
          onClick={() => onSelect?.(item.id)}
          aria-label={item.label}
          aria-pressed={selectedId === item.id}
        >
          <Card
            className={cn(
              "gap-0 overflow-hidden py-0 transition-shadow hover:shadow-sm",
              "border border-border hover:border-violet-500",
              "rounded-md"
            )}
            style={selectedId === item.id ? { borderColor: "black" } : undefined}
          >
            <div className="relative aspect-[3/2] bg-muted">
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ImageOff className="size-5" />
              </div>
            </div>
            <CardContent className="space-y-0.5 p-3">
              <div className="line-clamp-1 text-[12px] font-semibold leading-tight">Placeholder</div>
            </CardContent>
          </Card>
        </button>
      ))}
    </div>
  )
}
