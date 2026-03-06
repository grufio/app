"use client"

import * as React from "react"

import { NumericInput } from "@/features/editor/components/numeric-input"

export function NumericFieldControl(props: React.ComponentProps<typeof NumericInput>) {
  const { className, ...rest } = props
  return <NumericInput className={className} {...rest} />
}
