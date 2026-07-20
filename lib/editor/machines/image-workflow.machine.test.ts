import { createActor, waitFor, type Actor } from "xstate"
import { describe, expect, it, vi } from "vitest"

import { createImageWorkflowMachine } from "./image-workflow.machine"
import type { ImageWorkflowServices } from "./image-workflow.types"

const EMPTY_FILTER = { image: null, imageWithoutTrace: null, stack: [], emptyReason: null, error: "" }

function createServices(overrides?: Partial<ImageWorkflowServices>): ImageWorkflowServices {
  return {
    applyFilter: vi.fn(async () => {}),
    removeFilter: vi.fn(async () => {}),
    applyCrop: vi.fn(async () => {}),
    restoreBase: vi.fn(async () => {}),
    refreshAll: vi.fn(async () => ({ master: null, filter: EMPTY_FILTER })),
    saveTransform: vi.fn(async () => {}),
    applyTrace: vi.fn(async () => {}),
    clearTrace: vi.fn(async () => {}),
    uploadMaster: vi.fn(async () => {}),
    deleteMaster: vi.fn(async () => {}),
    ...overrides,
  }
}

const READY_TIP = {
  id: "img_1",
  signedUrl: "u",
  width_px: 100,
  height_px: 80,
  storage_path: "",
  source_image_id: null,
  name: "Image",
  isFilterResult: false,
}

/**
 * Drive the source to "ready" via the filter read-model (phase C): `source` is
 * now derived internally from the master + filter slices, so a loaded filter
 * with a trace-free tip is what makes the source ready + mutations allowed.
 */
function makeReady(actor: Actor<ReturnType<typeof createImageWorkflowMachine>>) {
  actor.send({
    type: "FILTER_LOADED",
    patch: { image: READY_TIP, imageWithoutTrace: READY_TIP, stack: [], emptyReason: null, error: "", loading: false, loadedOnce: true },
  })
}

describe("createImageWorkflowMachine", () => {
  it("derives source status from the filter read-model (phase C)", () => {
    const services = createServices()
    const actor = createActor(createImageWorkflowMachine(), { input: { services } })
    actor.start()

    // Initial: filter not loaded yet → loading.
    expect(actor.getSnapshot().matches({ source: "loading" })).toBe(true)

    // A loaded filter with a trace-free tip → ready.
    makeReady(actor)
    expect(actor.getSnapshot().matches({ source: "ready" })).toBe(true)
    expect(actor.getSnapshot().context.source.image?.id).toBe("img_1")

    // Loaded but no active image → empty.
    actor.send({
      type: "FILTER_LOADED",
      patch: { image: null, imageWithoutTrace: null, stack: [], emptyReason: "no_active_image", error: "", loading: false, loadedOnce: true },
    })
    expect(actor.getSnapshot().matches({ source: "empty" })).toBe(true)
  })

  it("assigns the filter slice from FILTER_LOADED (merge patch)", () => {
    const services = createServices()
    const actor = createActor(createImageWorkflowMachine(), { input: { services } })
    actor.start()

    actor.send({ type: "FILTER_LOADED", patch: { loading: true } })
    expect(actor.getSnapshot().context.filter.loading).toBe(true)

    actor.send({ type: "FILTER_LOADED", patch: { stack: [{ id: "f1", name: "F", filterType: "bw_hard", source_image_id: null }], loading: false, loadedOnce: true } })
    const filter = actor.getSnapshot().context.filter
    expect(filter.stack).toHaveLength(1)
    expect(filter.loading).toBe(false)
    expect(filter.loadedOnce).toBe(true)
  })

  it("runs remove -> sync -> idle on success", async () => {
    const services = createServices()
    const actor = createActor(createImageWorkflowMachine(), { input: { services } })
    actor.start()

    makeReady(actor)
    actor.send({ type: "FILTER_REMOVE", filterId: "f_1" })

    await waitFor(actor, (s) => s.matches({ operation: "idle" }))
    expect(services.removeFilter).toHaveBeenCalledWith("f_1")
    expect(services.refreshAll).toHaveBeenCalledTimes(1)
  })

  it("runs filter apply -> sync -> idle on success", async () => {
    const services = createServices()
    const actor = createActor(createImageWorkflowMachine(), { input: { services } })
    actor.start()

    makeReady(actor)
    actor.send({
      type: "FILTER_APPLY",
      filterType: "bw_hard",
      filterParams: { superpixel_width: 10, superpixel_height: 10 },
    })

    await waitFor(actor, (s) => s.matches({ operation: "idle" }))
    expect(services.applyFilter).toHaveBeenCalledWith({
      filterType: "bw_hard",
      filterParams: { superpixel_width: 10, superpixel_height: 10 },
    })
    expect(services.refreshAll).toHaveBeenCalledTimes(1)
  })

  it("runs trace apply -> sync -> idle on success", async () => {
    const services = createServices()
    const actor = createActor(createImageWorkflowMachine(), { input: { services } })
    actor.start()

    makeReady(actor)
    actor.send({ type: "TRACE_APPLY", kind: "pixelate", params: { colors: 8 } })

    await waitFor(actor, (s) => s.matches({ operation: "idle" }))
    expect(services.applyTrace).toHaveBeenCalledWith({ kind: "pixelate", params: { colors: 8 } })
    expect(services.refreshAll).toHaveBeenCalledTimes(1)
  })

  it("runs trace remove -> sync -> idle on success (no master reload service)", async () => {
    const services = createServices()
    const actor = createActor(createImageWorkflowMachine(), { input: { services } })
    actor.start()

    makeReady(actor)
    actor.send({ type: "TRACE_REMOVE" })

    await waitFor(actor, (s) => s.matches({ operation: "idle" }))
    expect(services.clearTrace).toHaveBeenCalledTimes(1)
    expect(services.refreshAll).toHaveBeenCalledTimes(1)
  })

  it("runs image upload -> sync -> idle (no canMutate guard needed)", async () => {
    const services = createServices()
    const actor = createActor(createImageWorkflowMachine(), { input: { services } })
    actor.start()

    // No ready source first: upload CREATES the source.
    const master = {
      id: "m_1",
      signedUrl: "u",
      masterSignedUrl: "mu",
      width_px: 100,
      height_px: 80,
      dpi: null,
      name: "Image",
      storage_path: "projects/p/master/img.png",
      format: "png",
      file_size_bytes: 1234,
    }
    actor.send({ type: "IMAGE_UPLOAD", master })

    await waitFor(actor, (s) => s.matches({ operation: "idle" }))
    expect(services.uploadMaster).toHaveBeenCalledWith({ master })
    expect(services.refreshAll).toHaveBeenCalledTimes(1)
  })

  it("assigns project images from PROJECT_IMAGES_LOADED in any state", async () => {
    const services = createServices()
    const actor = createActor(createImageWorkflowMachine(), { input: { services } })
    actor.start()

    expect(actor.getSnapshot().context.projectImages).toEqual([])

    const items = [
      { id: "img_1", name: "A", format: "png", width_px: 10, height_px: 10, dpi: null, storage_path: "p/1", storage_bucket: "b", file_size_bytes: 1, is_active: true, created_at: "2024-01-01" },
    ]
    actor.send({ type: "PROJECT_IMAGES_LOADED", items })
    expect(actor.getSnapshot().context.projectImages).toEqual(items)

    actor.send({ type: "PROJECT_IMAGES_LOADED", items: [] })
    expect(actor.getSnapshot().context.projectImages).toEqual([])
  })

  it("seeds master from SSR input and assigns/dedups via MASTER_LOADED", async () => {
    const services = createServices()
    const seed = { id: "a", masterRowId: "m", signedUrl: "u", masterSignedUrl: "mu", width_px: 10, height_px: 10, dpi: null, name: "M", restore_base: null }
    const actor = createActor(createImageWorkflowMachine(), { input: { services, initialMaster: seed } })
    actor.start()
    expect(actor.getSnapshot().context.master).toEqual(seed)

    // Same signature → identity preserved (no churn).
    const before = actor.getSnapshot().context.master
    actor.send({ type: "MASTER_LOADED", master: { ...seed }, loading: false })
    expect(actor.getSnapshot().context.master).toBe(before)

    // Real change → replaced.
    actor.send({ type: "MASTER_LOADED", master: { ...seed, signedUrl: "u2" }, loading: false })
    expect(actor.getSnapshot().context.master?.signedUrl).toBe("u2")

    actor.send({ type: "MASTER_LOADED", master: null })
    expect(actor.getSnapshot().context.master).toBeNull()
  })

  it("assigns master from the IMAGE_UPLOAD payload (masterRowId = own id)", async () => {
    const services = createServices()
    const actor = createActor(createImageWorkflowMachine(), { input: { services } })
    actor.start()
    const master = { id: "up1", signedUrl: "u", masterSignedUrl: "mu", width_px: 5, height_px: 5, dpi: null, name: "Up", storage_path: "p", format: "png", file_size_bytes: 1 }
    actor.send({ type: "IMAGE_UPLOAD", master })
    const ctxMaster = actor.getSnapshot().context.master
    expect(ctxMaster?.id).toBe("up1")
    expect(ctxMaster?.masterRowId).toBe("up1")
  })

  it("assigns master + filter from the refreshAll output on syncing.onDone", async () => {
    const refreshedFilter = { image: READY_TIP, imageWithoutTrace: READY_TIP, stack: [], emptyReason: null, error: "" }
    const refreshedMaster = { id: "rm", masterRowId: "rm", signedUrl: "ru", masterSignedUrl: "rmu", width_px: 4, height_px: 4, dpi: null, name: "R", restore_base: null }
    const services = createServices({ refreshAll: vi.fn(async () => ({ master: refreshedMaster, filter: refreshedFilter })) })
    const actor = createActor(createImageWorkflowMachine(), { input: { services } })
    actor.start()

    actor.send({ type: "REFRESH" })
    await waitFor(actor, (s) => s.matches({ operation: "idle" }))
    expect(actor.getSnapshot().context.master?.id).toBe("rm")
    expect(actor.getSnapshot().context.filter.imageWithoutTrace?.id).toBe("img_1")
    expect(actor.getSnapshot().matches({ source: "ready" })).toBe(true)
  })

  it("runs image delete -> sync -> idle on success", async () => {
    const services = createServices()
    const actor = createActor(createImageWorkflowMachine(), { input: { services } })
    actor.start()

    makeReady(actor)
    actor.send({ type: "IMAGE_DELETE" })

    await waitFor(actor, (s) => s.matches({ operation: "idle" }))
    expect(services.deleteMaster).toHaveBeenCalledTimes(1)
    expect(services.refreshAll).toHaveBeenCalledTimes(1)
  })

  it("coalesces transform saves with latest-wins semantics", async () => {
    const services = createServices({
      saveTransform: vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
      }),
    })
    const actor = createActor(createImageWorkflowMachine(), { input: { services } })
    actor.start()

    makeReady(actor)
    actor.send({ type: "TRANSFORM_SAVE", transform: { widthPxU: 1000n, heightPxU: 800n, rotationDeg: 0 } })
    actor.send({ type: "TRANSFORM_SAVE", transform: { widthPxU: 1001n, heightPxU: 801n, rotationDeg: 1 } })
    actor.send({ type: "TRANSFORM_SAVE", transform: { widthPxU: 1002n, heightPxU: 802n, rotationDeg: 2 } })

    await waitFor(actor, (s) => s.matches({ persistence: "idle" }))
    expect(services.saveTransform).toHaveBeenCalledTimes(2)
    expect(services.saveTransform).toHaveBeenLastCalledWith({
      transform: { widthPxU: 1002n, heightPxU: 802n, rotationDeg: 2 },
    })
  })

  it("enters error on apply failure and can recover via retry", async () => {
    const services = createServices({
      applyFilter: vi.fn(async () => {
        throw new Error("apply failed")
      }),
    })
    const actor = createActor(createImageWorkflowMachine(), { input: { services } })
    actor.start()

    makeReady(actor)
    actor.send({ type: "FILTER_APPLY", filterType: "bw_hard", filterParams: {} })
    await waitFor(actor, (s) => s.matches({ operation: "error" }))
    expect(actor.getSnapshot().context.lastOpError).toMatchObject({ message: "apply failed" })

    services.applyFilter = vi.fn(async () => {})
    actor.send({ type: "RETRY" })
    await waitFor(actor, (s) => s.matches({ operation: "idle" }))
    expect(services.refreshAll).toHaveBeenCalledTimes(1)
  })

  it("runs explicit refresh event through syncing", async () => {
    const services = createServices()
    const actor = createActor(createImageWorkflowMachine(), { input: { services } })
    actor.start()

    actor.send({ type: "REFRESH" })
    await waitFor(actor, (s) => s.matches({ operation: "idle" }))
    expect(services.refreshAll).toHaveBeenCalledTimes(1)
  })

  it("accepts REFRESH while in operation error and recovers via syncing", async () => {
    const refreshAll = vi.fn(async () => ({ master: null, filter: EMPTY_FILTER }))
    const services = createServices({
      applyFilter: vi.fn(async () => {
        throw new Error("apply failed")
      }),
      refreshAll,
    })
    const actor = createActor(createImageWorkflowMachine(), { input: { services } })
    actor.start()
    makeReady(actor)

    actor.send({ type: "FILTER_APPLY", filterType: "bw_hard", filterParams: {} })
    await waitFor(actor, (s) => s.matches({ operation: "error" }))
    actor.send({ type: "REFRESH" })
    await waitFor(actor, (s) => s.matches({ operation: "idle" }))
    expect(refreshAll).toHaveBeenCalledTimes(1)
  })

  it("updates service adapters via SERVICES_UPDATE without machine reset", async () => {
    const oldApplyFilter = vi.fn(async () => {
      throw new Error("old service should not run")
    })
    const newApplyFilter = vi.fn(async () => {})
    const services = createServices({ applyFilter: oldApplyFilter })
    const actor = createActor(createImageWorkflowMachine(), { input: { services } })
    actor.start()

    actor.send({
      type: "SERVICES_UPDATE",
      services: {
        ...services,
        applyFilter: newApplyFilter,
      },
    })
    makeReady(actor)
    actor.send({ type: "FILTER_APPLY", filterType: "bw_hard", filterParams: {} })

    await waitFor(actor, (s) => s.matches({ operation: "idle" }))
    expect(newApplyFilter).toHaveBeenCalledTimes(1)
    expect(oldApplyFilter).toHaveBeenCalledTimes(0)
  })

  it("keeps mutation flow deterministic for back-to-back events", async () => {
    let releaseApply: (() => void) | null = null
    const services = createServices({
      applyFilter: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            releaseApply = resolve
          })
      ),
    })
    const actor = createActor(createImageWorkflowMachine(), { input: { services } })
    actor.start()
    makeReady(actor)

    actor.send({ type: "FILTER_APPLY", filterType: "bw_hard", filterParams: {} })
    await waitFor(actor, (s) => s.matches({ operation: "applyingFilter" }))

    // A second mutation while busy must not start another mutation actor.
    actor.send({ type: "FILTER_REMOVE", filterId: "f_1" })
    expect(services.removeFilter).toHaveBeenCalledTimes(0)

    const release = releaseApply as (() => void) | null
    if (!release) throw new Error("apply filter release function not set")
    release()
    await waitFor(actor, (s) => s.matches({ operation: "idle" }))
    expect(services.applyFilter).toHaveBeenCalledTimes(1)
    expect(services.refreshAll).toHaveBeenCalledTimes(1)
  })

  it("supports retry when syncing fails after mutation", async () => {
    const refreshAll = vi
      .fn()
      .mockRejectedValueOnce(new Error("refresh failed"))
      .mockResolvedValueOnce({ master: null, filter: EMPTY_FILTER })
    const services = createServices({ refreshAll })
    const actor = createActor(createImageWorkflowMachine(), { input: { services } })
    actor.start()
    makeReady(actor)

    actor.send({ type: "FILTER_APPLY", filterType: "bw_hard", filterParams: {} })
    await waitFor(actor, (s) => s.matches({ operation: "error" }))
    expect(actor.getSnapshot().context.lastOpError).toMatchObject({ message: "refresh failed" })

    actor.send({ type: "RETRY" })
    await waitFor(actor, (s) => s.matches({ operation: "idle" }))
    expect(refreshAll).toHaveBeenCalledTimes(2)
  })

  it("recovers from persistence error on next transform save", async () => {
    const saveTransform = vi
      .fn()
      .mockRejectedValueOnce(new Error("persist failed"))
      .mockResolvedValueOnce(undefined)
    const services = createServices({ saveTransform })
    const actor = createActor(createImageWorkflowMachine(), { input: { services } })
    actor.start()
    makeReady(actor)

    actor.send({ type: "TRANSFORM_SAVE", transform: { widthPxU: 1000n, heightPxU: 800n, rotationDeg: 0 } })
    await waitFor(actor, (s) => s.matches({ persistence: "error" }))
    expect(actor.getSnapshot().context.lastPersistenceError).toMatchObject({ message: "persist failed" })

    actor.send({ type: "TRANSFORM_SAVE", transform: { widthPxU: 1001n, heightPxU: 801n, rotationDeg: 1 } })
    await waitFor(actor, (s) => s.matches({ persistence: "idle" }))
    expect(saveTransform).toHaveBeenCalledTimes(2)
  })
})
