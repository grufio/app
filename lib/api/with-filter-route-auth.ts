import { NextResponse } from "next/server"
import { isUuid, jsonError, requireUser } from "./route-guards"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Context object passed to authenticated route handlers.
 * 
 * Provides pre-validated authentication and authorization data:
 * - Authenticated Supabase client with user session
 * - Validated project ID that passed RLS checks
 * - User ID from the authenticated session
 */
type RouteContext = {
  supabase: SupabaseClient
  projectId: string
  userId: string
}

/**
 * Type definition for route handler functions used with withFilterRouteAuth.
 * 
 * @template T - The type of data returned in the NextResponse
 * @param req - The incoming Request object
 * @param context - Pre-validated authentication context
 * @returns Promise resolving to a NextResponse
 */
type RouteHandler<T = unknown> = (
  req: Request,
  context: RouteContext
) => Promise<NextResponse<T>>

/**
 * Authentication and authorization wrapper for filter API routes.
 * 
 * Handles common boilerplate for all filter routes:
 * - Validates projectId UUID format
 * - Authenticates the user via Supabase
 * - Verifies project access through RLS
 * 
 * @param req - The incoming Request object
 * @param projectId - The project ID from route params
 * @param handler - The route handler function to execute after auth
 * @returns NextResponse with appropriate success or error response
 * 
 * @example
 * ```typescript
 * export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
 *   const { projectId } = await params
 *   
 *   return withFilterRouteAuth(req, projectId, async (req, context) => {
 *     // context provides: supabase, projectId, userId
 *     const result = await someService({ supabase: context.supabase, projectId: context.projectId })
 *     return NextResponse.json(result)
 *   })
 * }
 * ```
 */
export async function withFilterRouteAuth<T = unknown>(
  req: Request,
  projectId: string,
  handler: RouteHandler<T>
): Promise<NextResponse<T>> {
  // Validate projectId
  if (!isUuid(String(projectId))) {
    return jsonError("Invalid projectId", 400, { stage: "validation", where: "params" }) as unknown as NextResponse<T>
  }

  // Authenticate user
  const supabase = await createSupabaseServerClient()
  const u = await requireUser(supabase)
  if (!u.ok) return u.res as unknown as NextResponse<T>

  // Verify project access
  const { data: projectRow, error: projectErr } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle()

  if (projectErr) {
    return jsonError("Failed to verify project access", 400, { stage: "project_access" }) as unknown as NextResponse<T>
  }
  if (!projectRow?.id) {
    return jsonError("Forbidden (project not accessible)", 403, { stage: "rls_denied", where: "project_access" }) as unknown as NextResponse<T>
  }

  // Call handler with authenticated context
  return handler(req, {
    supabase,
    projectId,
    userId: u.user.id,
  })
}
