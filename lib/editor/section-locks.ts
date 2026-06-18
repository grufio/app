/**
 * Section-Lock invariant for the editor — derived from data presence.
 *
 * The pipeline is layered: Master → Filter → Trace. Editing a layer that
 * something downstream depends on would silently break it, so the functions of
 * that layer are DISABLED while a downstream artefact exists.
 *
 * There is no lock symbol / unlock toggle: to edit a locked layer the user
 * deletes the downstream (filter / trace), which cascades with a confirmation
 * (see the delete dialogs). Locked functions are disabled now, hidden later.
 *
 * | State                 | imageLocked | filterLocked |
 * |-----------------------|-------------|--------------|
 * | Only Master           | false       | false        |
 * | + Filter              | true        | false        |
 * | + Filter + Trace      | true        | true         |
 * | + Trace (no filter)   | true        | true         |
 *
 * imageLocked = a filter and/or trace depends on the image → image functions
 *   (resize / move / crop) are disabled.
 * filterLocked = a trace depends on the filter → filter functions are disabled.
 */
export type SectionLocks = {
  imageLocked: boolean
  filterLocked: boolean
}

export function deriveSectionLocks(input: {
  hasFilter: boolean
  hasTrace: boolean
}): SectionLocks {
  const { hasFilter, hasTrace } = input
  return {
    imageLocked: hasFilter || hasTrace,
    filterLocked: hasTrace,
  }
}
