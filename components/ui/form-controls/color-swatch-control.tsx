"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

export function ColorSwatchControl(props: React.ComponentProps<"input">) {
  const { className, type = "color", ...rest } = props
  return (
    <input
      type={type}
      className={cn(
        "size-4 cursor-pointer appearance-none overflow-hidden rounded-sm border border-input bg-transparent p-0",
        "[&::-webkit-color-swatch-wrapper]:p-0",
        "[&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch]:p-0 [&::-webkit-color-swatch]:rounded-none",
        "[&::-moz-color-swatch]:border-0 [&::-moz-color-swatch]:p-0",
        className
      )}
      {...rest}
    />
  )
}
