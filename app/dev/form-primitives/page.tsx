/**
 * Form-primitives gallery (dev + E2E only).
 *
 * One page that renders every variant of every primitive in
 * `components/ui/form-controls/` plus the editor-only wrappers that
 * stack on them, so visual inconsistencies are obvious in a single
 * scroll instead of clicking through ten editor panels.
 *
 * Production builds 404 the route. The E2E build (`E2E_TEST=1`)
 * keeps it reachable so `forms.visual.spec.ts` can snapshot every
 * primitive in one go and catch cross-cutting regressions.
 */
import { notFound } from "next/navigation"

import { FormPrimitivesDemoClient } from "./demo-client"

export const dynamic = "force-dynamic"

export default function FormPrimitivesDevPage() {
  const isE2E = process.env.NEXT_PUBLIC_E2E_TEST === "1" || process.env.E2E_TEST === "1"
  if (process.env.NODE_ENV === "production" && !isE2E) {
    notFound()
  }
  return <FormPrimitivesDemoClient />
}
