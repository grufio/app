/**
 * Section-Lock invariant for the editor — derived from data presence.
 *
 * The editor pipeline is layered: Master → Filter → Trace. Each layer
 * derives from the previous one. If the user edits a layer that
 * something downstream depends on, the downstream artefact silently
 * becomes inconsistent. To prevent that, sections that have a
 * dependent downstream artefact are **locked** until the user
 * explicitly removes the downstream (Cascade-Delete on unlock).
 *
 * Lock matrix (pure derivation, no DB state):
 *
 * | State                       | imageLocked | imageToggleable | filterLocked | filterToggleable |
 * |-----------------------------|-------------|-----------------|--------------|------------------|
 * | Only Master                 | false       | —               | false        | —                |
 * | + Filter                    | true        | true            | false        | —                |
 * | + Filter + Trace            | true        | true            | true         | true             |
 * | Only Trace (no Filter)      | true        | true            | true         | **false**        |
 *
 * Why "filter not toggleable when only trace exists": there's no
 * filter to keep, and adding one would break the trace anyway. The
 * only way to enable filter editing is to delete trace, which is
 * done via the Trace section — not by toggling Filter's lock.
 *
 * Toggling a lock unlocks the section by cascade-deleting whatever
 * downstream depends on it:
 * - Unlock Image (filter present, no trace) → delete all filters
 * - Unlock Image (filter + trace) → delete trace + all filters
 * - Unlock Image (trace only) → delete trace
 * - Unlock Filter (filter + trace) → delete trace
 *
 * Hidden filters count as "filter present" — hidden ≠ deleted, the
 * underlying data still depends on the master.
 */
export type SectionLocks = {
  imageLocked: boolean
  imageToggleable: boolean
  filterLocked: boolean
  filterToggleable: boolean
}

export function deriveSectionLocks(input: {
  hasFilter: boolean
  hasTrace: boolean
}): SectionLocks {
  const { hasFilter, hasTrace } = input
  const imageLocked = hasFilter || hasTrace
  const filterLocked = hasTrace
  return {
    imageLocked,
    // Image-lock is always toggleable while locked: the cascade-delete
    // target is whatever downstream is present.
    imageToggleable: imageLocked,
    filterLocked,
    // Filter-lock is only toggleable when a filter exists to "keep
    // editable" by removing trace. With trace-only-no-filter, there's
    // nothing for the toggle to unlock to.
    filterToggleable: filterLocked && hasFilter,
  }
}
