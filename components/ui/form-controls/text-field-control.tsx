"use client"

import * as React from "react"

import { InputGroupInput } from "@/components/ui/form-controls/input-group"

export function TextFieldControl(props: React.ComponentProps<typeof InputGroupInput>) {
  const { className, ...rest } = props
  return <InputGroupInput className={className} {...rest} />
}
