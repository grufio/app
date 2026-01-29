/**
 * Editor services public entrypoint.
 *
 * Responsibilities:
 * - Export UI-agnostic editor business logic (use-cases, pure helpers, repos).
 * - Keep Next.js server-only and browser-only code in dedicated subfolders.
 */
export * from "./artboard-display"
export * from "./image-sizing"

export * from "./workspace/types"
export * from "./workspace/normalize"
export * from "./workspace/default"
export * from "./workspace/browser-repo-supabase"
export * from "./workspace-operations"

export * from "./canvas/world-size"
export * from "./canvas/selection-handles"

export * from "./grid/types"
export * from "./grid/normalize"
export * from "./grid/default"
export * from "./grid/schema-errors"
export * from "./grid/browser-repo-supabase"
export * from "./grid/operations"

export * from "./server/schema-errors"
export * from "./server/master-image"
export * from "./server/image-state"

