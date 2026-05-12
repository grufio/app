/**
 * Pure analysis function for verify-schema-drift.
 *
 * Separated so the matching/softener rules can be unit-tested
 * without invoking the Supabase CLI or Docker.
 *
 * Input: normalised committed + fresh schema dumps (whitespace
 * trimmed, comment-only lines stripped — see normalise() in the
 * caller).
 *
 * Output kinds:
 *   - "match"                  — both sides are equal line-for-line
 *   - "pending_addition"       — committed has lines fresh lacks; no
 *                                line-only-in-fresh (this PR's
 *                                migration adds rows/columns)
 *   - "pending_redefinition"   — both sides disagree on lines that
 *                                share a stable identity (constraint
 *                                name, index name); migration drops
 *                                + adds same object with a new
 *                                definition
 *   - "drift"                  — fresh has lines committed lacks
 *                                that DON'T pair with a committedOnly
 *                                redefinition — real drift, hard fail
 */

/**
 * Stable identity for a SQL statement line. Returns null when the
 * line can't be safely paired — those fall through to drift.
 * Patterns are narrow on purpose: a false positive here silently
 * hides real schema drift.
 */
export function stableIdentity(line) {
  const constraint = line.match(/ADD CONSTRAINT "([^"]+)"/)
  if (constraint) return `constraint:${constraint[1]}`
  const createIndex = line.match(/CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?"?([A-Za-z0-9_]+)"?/)
  if (createIndex) return `index:${createIndex[1]}`
  return null
}

export function analyzeDrift(committed, fresh) {
  if (committed === fresh) {
    return { kind: "match", freshOnly: [], committedOnly: [], unexplainedFresh: [] }
  }

  const committedLines = committed.split("\n")
  const freshLines = fresh.split("\n")
  const committedSet = new Set(committedLines)
  const freshSet = new Set(freshLines)
  const freshOnly = freshLines.filter((line) => !committedSet.has(line))
  const committedOnly = committedLines.filter((line) => !freshSet.has(line))

  if (freshOnly.length === 0) {
    return { kind: "pending_addition", freshOnly, committedOnly, unexplainedFresh: [] }
  }

  const committedOnlyByKey = new Map()
  for (const line of committedOnly) {
    const key = stableIdentity(line)
    if (!key) continue
    if (!committedOnlyByKey.has(key)) committedOnlyByKey.set(key, [])
    committedOnlyByKey.get(key).push(line)
  }

  const unexplainedFresh = []
  for (const line of freshOnly) {
    const key = stableIdentity(line)
    const bucket = key ? committedOnlyByKey.get(key) : null
    if (bucket && bucket.length > 0) {
      bucket.shift()
      continue
    }
    unexplainedFresh.push(line)
  }

  // Trailing-comma equivalence: pg_dump renders list syntax (ENUM
  // values, CHECK value lists, ARRAY constructors) with N-1 commas
  // and one trailing-comma-free last entry. Appending a new item
  // flips the previously-last item's trailing comma — a positional
  // artefact, not a semantic change. Pair any freshOnly line with a
  // committedOnly line whose content matches after stripping a
  // trailing `,`.
  const committedOnlyByTrim = new Map()
  for (const line of committedOnly) {
    const trimmed = line.replace(/,\s*$/, "")
    if (!committedOnlyByTrim.has(trimmed)) committedOnlyByTrim.set(trimmed, [])
    committedOnlyByTrim.get(trimmed).push(line)
  }
  const stillUnexplained = []
  for (const line of unexplainedFresh) {
    const trimmed = line.replace(/,\s*$/, "")
    const bucket = committedOnlyByTrim.get(trimmed)
    if (bucket && bucket.length > 0) {
      bucket.shift()
      continue
    }
    stillUnexplained.push(line)
  }

  if (stillUnexplained.length === 0) {
    return { kind: "pending_redefinition", freshOnly, committedOnly, unexplainedFresh: stillUnexplained }
  }

  return { kind: "drift", freshOnly, committedOnly, unexplainedFresh: stillUnexplained }
}
