"use client"

import type { JsonRecord } from "@/lib/api/http"

export type ApiErrorPayload = JsonRecord | null

function stageFromPayload(payload: ApiErrorPayload): string | null {
  const stage = payload && typeof payload.stage === "string" ? payload.stage.trim() : ""
  return stage ? stage : null
}

export function makeApiErrorCode(prefix: string, action: string, status: number, payload: ApiErrorPayload): string {
  const stage = stageFromPayload(payload)
  return `${prefix}.${action}.${stage ?? `http_${status}`}`
}

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly payload: ApiErrorPayload

  constructor(args: { prefix: string; action: string; status: number; payload: ApiErrorPayload }) {
    const code = makeApiErrorCode(args.prefix, args.action, args.status, args.payload)
    super(code)
    this.name = "ApiError"
    this.code = code
    this.status = args.status
    this.payload = args.payload
  }
}

