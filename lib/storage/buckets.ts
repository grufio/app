/**
 * Storage bucket name constants.
 *
 * Why: the bucket name `"project_images"` was duplicated as a string
 * literal across ~140 call sites — every storage upload/download/remove,
 * every signed-URL helper, every test fixture. Renaming the bucket or
 * splitting it (originals vs working copies vs output) would have meant
 * a 140-place find-replace.
 *
 * Production code MUST import from here. Test mock fixtures may keep
 * literals if they're symbolic (the value isn't load-bearing). SQL
 * migrations and `db/schema.sql` keep the literal — they run *outside*
 * the TypeScript world.
 *
 * Future extension: when other buckets are introduced (e.g.
 * `final_canvases`, `pigment_swatches`), add them here so the contract
 * stays in one place.
 */

export const PROJECT_IMAGES_BUCKET = "project_images" as const

export type ProjectImagesBucket = typeof PROJECT_IMAGES_BUCKET
