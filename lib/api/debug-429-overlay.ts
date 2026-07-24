/**
 * TEMPORARY DIAGNOSTIC — remove once the Apply-429 root cause is confirmed.
 *
 * The 429 that breaks Apply never reaches the Next.js function (function logs
 * only show 200), so it must be captured on the client. This module renders a
 * fixed, on-screen panel listing every 429 the app receives together with the
 * response headers and body — so the source (Vercel edge vs. an upstream
 * service vs. an app rate-limiter) can be identified WITHOUT browser devtools,
 * which matters on mobile.
 *
 * Distinguishing headers to look for:
 *  - `server`, `x-vercel-id`, `x-vercel-*`  → generated at the Vercel edge
 *  - `retry-after`, `x-ratelimit-*`         → a rate-limiter (edge or upstream)
 *  - a JSON app-error body                  → an app/route rate-limiter
 */

export type RateLimit429Report = {
  url: string
  method: string
  headers: Record<string, string>
  bodyText: string
}

const PANEL_ID = "debug-429-panel"
let seq = 0

function ts(): string {
  // Wall-clock time is fine here: this is throwaway diagnostic UI, not app logic.
  const d = new Date()
  return d.toTimeString().slice(0, 8)
}

function ensurePanel(): HTMLElement | null {
  if (typeof document === "undefined") return null
  let panel = document.getElementById(PANEL_ID)
  if (panel) return panel

  panel = document.createElement("div")
  panel.id = PANEL_ID
  panel.style.cssText = [
    "position:fixed",
    "left:8px",
    "right:8px",
    "bottom:8px",
    "z-index:2147483647",
    "max-height:60vh",
    "overflow:auto",
    "background:#1a0000",
    "color:#ffdede",
    "font:12px/1.4 ui-monospace,Menlo,Consolas,monospace",
    "border:2px solid #ff4d4d",
    "border-radius:8px",
    "padding:8px 10px",
    "box-shadow:0 4px 24px rgba(0,0,0,.5)",
    "white-space:pre-wrap",
    "word-break:break-word",
  ].join(";")

  const header = document.createElement("div")
  header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-weight:700"
  const title = document.createElement("span")
  title.textContent = "429 DEBUG"
  const close = document.createElement("button")
  close.textContent = "×"
  close.style.cssText = "background:#ff4d4d;color:#000;border:0;border-radius:4px;width:24px;height:24px;font-size:16px;font-weight:700"
  close.onclick = () => panel?.remove()
  header.appendChild(title)
  header.appendChild(close)
  panel.appendChild(header)

  document.body.appendChild(panel)
  return panel
}

/** Append a captured 429 (headers + body) to the on-screen diagnostic panel. */
export function reportRateLimit429(report: RateLimit429Report): void {
  try {
    const panel = ensurePanel()
    if (!panel) return
    seq += 1

    const entry = document.createElement("div")
    entry.style.cssText = "border-top:1px solid #ff4d4d55;padding-top:6px;margin-top:6px"

    const headerLines = Object.entries(report.headers)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n")

    entry.textContent =
      `#${seq} ${ts()}  ${report.method} ${report.url}\n` +
      `HEADERS:\n${headerLines || "  (none readable)"}\n` +
      `BODY:\n  ${report.bodyText ? report.bodyText.slice(0, 500) : "(empty)"}`

    panel.appendChild(entry)
  } catch {
    // A diagnostic must never break the app.
  }
}
