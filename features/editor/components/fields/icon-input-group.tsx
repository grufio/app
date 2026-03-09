"use client"

/**
 * Shared icon+control wrapper for editor panel fields.
 *
 * Responsibilities:
 * - Compose an `InputGroup` with a trailing/leading addon slot for icons.
 * - Must not add extra DOM wrappers (layout-sensitive).
 */
import type * as React from "react"

import { FieldGroup, FieldGroupAddon } from "@/components/ui/form-controls/field-group"

type AddonAlign = React.ComponentProps<typeof FieldGroupAddon>["align"]

/**
 * Shared wrapper for the common pattern:
 * <InputGroup>
 *   {control}
 *   <InputGroupAddon align="inline-start">{icon}</InputGroupAddon>
 * </InputGroup>
 *
 * IMPORTANT: This component must not introduce extra DOM nodes.
 */
export function IconInputGroup({
  addon,
  addonAlign,
  addonClassName,
  groupClassName,
  children,
}: {
  addon: React.ReactNode
  addonAlign?: AddonAlign
  addonClassName?: string
  groupClassName?: string
  children: React.ReactNode
}) {
  return (
    <FieldGroup className={groupClassName}>
      {children}
      <FieldGroupAddon align={addonAlign} className={addonClassName}>
        {addon}
      </FieldGroupAddon>
    </FieldGroup>
  )
}

