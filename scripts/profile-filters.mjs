#!/usr/bin/env node
/**
 * Latency profiler for the filter HTTP service (F18).
 *
 * Hits `/filters/pixelate` and `/filters/numerate` directly (no Next.js
 * pipeline) with a deterministic fixture image, parses the
 * `X-Profile-Phases` header the service emits, and prints a side-by-
 * side phase breakdown so we can see where numerate's wall-clock goes
 * versus the structurally similar pixelate.
 *
 * Usage:
 *   1. Run the filter-service locally:
 *      cd filter-service && venv/bin/uvicorn app.main:app --port 8001
 *   2. node scripts/profile-filters.mjs
 *
 * Env:
 *   FILTER_SERVICE_URL    default http://localhost:8001
 *   FILTER_SERVICE_TOKEN  bearer token if the service is gated
 *   PROFILE_RUNS          number of warm-cache runs per filter (default 5)
 *   PROFILE_FIXTURE       path to the input PNG (default scripts/profile-fixtures/profile-1920x1080.png)
 */

import { readFile } from "node:fs/promises"
import { performance } from "node:perf_hooks"
import { fileURLToPath } from "node:url"
import path from "node:path"

const SERVICE = process.env.FILTER_SERVICE_URL || "http://localhost:8001"
const TOKEN = (process.env.FILTER_SERVICE_TOKEN ?? "").trim()
const RUNS = Number(process.env.PROFILE_RUNS ?? 5)
const FIXTURE = process.env.PROFILE_FIXTURE
  ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "profile-fixtures/profile-1920x1080.png")

const HEADERS = { "Content-Type": "application/json", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) }

async function probeHealth() {
  const r = await fetch(`${SERVICE}/health`).catch(() => null)
  if (!r?.ok) {
    console.error(`Filter service at ${SERVICE} not reachable. Start it first:`)
    console.error("  cd filter-service && venv/bin/uvicorn app.main:app --port 8001")
    process.exit(1)
  }
}

function parsePhases(headerValue) {
  if (!headerValue) return {}
  const out = {}
  for (const part of headerValue.split(",")) {
    const [k, v] = part.split("=")
    if (k && v) out[k.trim()] = Number.parseFloat(v)
  }
  return out
}

async function profileOnce(filter, body) {
  const t0 = performance.now()
  const res = await fetch(`${SERVICE}/filters/${filter}`, { method: "POST", headers: HEADERS, body: JSON.stringify(body) })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`${filter} HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  const bytes = await res.arrayBuffer()
  const total = performance.now() - t0
  return {
    total_ms: total,
    output_bytes: bytes.byteLength,
    phases: parsePhases(res.headers.get("X-Profile-Phases")),
  }
}

function summarise(label, runs) {
  // First run includes any fastapi/uvicorn warmup; report median to dampen jitter.
  const sorted = [...runs].sort((a, b) => a.total_ms - b.total_ms)
  const mid = sorted[Math.floor(sorted.length / 2)]
  const phaseKeys = new Set()
  for (const r of runs) for (const k of Object.keys(r.phases)) phaseKeys.add(k)
  const phaseMedian = {}
  for (const k of phaseKeys) {
    const xs = runs.map((r) => r.phases[k]).filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
    if (xs.length) phaseMedian[k] = xs[Math.floor(xs.length / 2)]
  }
  return {
    label,
    runs: runs.length,
    median_total_ms: Number(mid.total_ms.toFixed(1)),
    median_output_bytes: mid.output_bytes,
    median_phases_ms: Object.fromEntries(Object.entries(phaseMedian).map(([k, v]) => [k, Number(v.toFixed(1))])),
  }
}

async function main() {
  await probeHealth()

  const buf = await readFile(FIXTURE)
  const image_base64 = buf.toString("base64")
  console.error(`fixture: ${FIXTURE}  bytes=${buf.byteLength}  runs=${RUNS}`)

  const pixelateBody = { image_base64, superpixel_width: 10, superpixel_height: 10, color_mode: "rgb", num_colors: 16 }
  const numerateBody = { image_base64, superpixel_width: 10, superpixel_height: 10, stroke_width: 2, show_colors: true }

  const filters = [
    { name: "pixelate", body: pixelateBody },
    { name: "numerate", body: numerateBody },
  ]

  for (const f of filters) {
    // One warmup, then RUNS measured runs.
    await profileOnce(f.name, f.body)
    const runs = []
    for (let i = 0; i < RUNS; i++) runs.push(await profileOnce(f.name, f.body))
    f.summary = summarise(f.name, runs)
  }

  for (const f of filters) {
    console.log("\n--", f.name, "--")
    console.log("  median total:    ", f.summary.median_total_ms, "ms")
    console.log("  median output:   ", f.summary.median_output_bytes, "bytes")
    console.log("  median phases:")
    for (const [k, v] of Object.entries(f.summary.median_phases_ms)) {
      console.log(`    ${k.padEnd(12)} ${v} ms`)
    }
  }

  const px = filters[0].summary
  const nm = filters[1].summary
  console.log("\n-- numerate vs pixelate --")
  console.log(`  total ratio:        ${(nm.median_total_ms / px.median_total_ms).toFixed(2)}×`)
  console.log(`  output size ratio:  ${(nm.median_output_bytes / px.median_output_bytes).toFixed(2)}×`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
