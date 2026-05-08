/**
 * Form-primitives gallery (dev only).
 *
 * One page that renders every variant of every primitive in
 * `components/ui/form-controls/` plus the editor-only wrappers that
 * stack on them, so visual inconsistencies are obvious in a single
 * scroll instead of clicking through ten editor panels.
 *
 * 404s in production builds — `notFound()` keeps it out of the
 * crawlable surface even if someone deploys the route.
 */
import { notFound } from "next/navigation"

import { FormPrimitivesDemoClient } from "./demo-client"

export const dynamic = "force-dynamic"

export default function FormPrimitivesDevPage() {
  if (process.env.NODE_ENV === "production") {
    notFound()
  }
  return <FormPrimitivesDemoClient />
}
