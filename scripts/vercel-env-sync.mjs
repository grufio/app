#!/usr/bin/env node
import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"

function parseArgs(argv) {
  const out = { file: ".env.vercel.production", target: "production", token: process.env.VERCEL_TOKEN ?? "" }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === "--file") out.file = argv[++i] ?? out.file
    else if (a === "--target") out.target = argv[++i] ?? out.target
    else if (a === "--token") out.token = argv[++i] ?? out.token
  }
  return out
}

function parseEnvFile(path) {
  const content = readFileSync(path, "utf8")
  const entries = []
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const idx = line.indexOf("=")
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1)
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!key) continue
    entries.push([key, value])
  }
  return entries
}

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
      ...options,
    })

    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (d) => {
      stdout += String(d)
      process.stdout.write(d)
    })
    child.stderr.on("data", (d) => {
      stderr += String(d)
      process.stderr.write(d)
    })

    if (options.stdin != null) {
      child.stdin.write(options.stdin)
    }
    child.stdin.end()

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        reject(new Error(`${cmd} ${args.join(" ")} failed with exit code ${code}`))
      }
    })
  })
}

async function main() {
  const { file, target, token } = parseArgs(process.argv.slice(2))

  if (!existsSync(file)) {
    throw new Error(`Env file not found: ${file}`)
  }
  if (!existsSync(".vercel/project.json")) {
    throw new Error("Vercel project is not linked. Run: vercel link")
  }

  const entries = parseEnvFile(file)
  if (!entries.length) {
    throw new Error(`No KEY=VALUE entries found in ${file}`)
  }

  const globalArgs = token ? ["--token", token] : []

  for (const [key, value] of entries) {
    // Ensure idempotent updates by removing existing value first.
    await run("vercel", ["env", "rm", key, target, "--yes", ...globalArgs]).catch(() => {})
    await run("vercel", ["env", "add", key, target, ...globalArgs], { stdin: `${value}\n` })
  }

  console.log(`Synced ${entries.length} variables from ${file} to Vercel target '${target}'.`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
