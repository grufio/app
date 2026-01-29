// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
}

type ErrorEvent = {
  message: string
  stack?: string
  name?: string
  digest?: string
  tags?: Record<string, string>
  extra?: Record<string, unknown>
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" })

  let payload: ErrorEvent | null = null
  try {
    payload = (await req.json()) as ErrorEvent
  } catch {
    return json(400, { error: "Invalid JSON" })
  }

  if (!payload || typeof payload.message !== "string" || !payload.message.trim()) {
    return json(400, { error: "Missing message" })
  }

  // MVP behavior: log event to function logs (viewable in Supabase).
  // You can later extend this to insert into a table or forward to a vendor.
  console.error("error-ingest:", payload)

  return json(200, { ok: true })
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/error-ingest' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
