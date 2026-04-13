import type { SupabaseClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { withProjectRouteAuth } from "./with-project-route-auth"

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

type RouteErrorPayload = {
  error: string
  stage: string
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
) => Promise<NextResponse<T> | NextResponse<RouteErrorPayload>>

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
): Promise<NextResponse<T> | NextResponse<RouteErrorPayload>> {
  return withProjectRouteAuth(req, projectId, async (request, context) => {
    return handler(request, {
      supabase: context.supabase,
      projectId: context.projectId,
      userId: context.userId,
    })
  })
}
