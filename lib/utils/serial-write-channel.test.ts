import { describe, expect, it } from "vitest"

import { createSerialWriteChannel, SupersededWriteError } from "./serial-write-channel"

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

describe("serial-write-channel", () => {
  it("enqueueLatestDropStale resolves stale task as null and keeps latest", async () => {
    const ch = createSerialWriteChannel()

    const first = ch.enqueueLatestDropStale(async () => {
      await sleep(30)
      return "first"
    })

    await sleep(5)

    const second = ch.enqueueLatestDropStale(async () => {
      await sleep(5)
      return "second"
    })

    await expect(first).resolves.toBe(null)
    await expect(second).resolves.toBe("second")
  })

  it("enqueueLatestDropStale ignores stale errors", async () => {
    const ch = createSerialWriteChannel()

    const first = ch.enqueueLatestDropStale(async () => {
      await sleep(20)
      throw new Error("boom")
    })

    await sleep(1)

    const second = ch.enqueueLatestDropStale(async () => {
      await sleep(1)
      return 123
    })

    await expect(first).resolves.toBe(null)
    await expect(second).resolves.toBe(123)
  })

  it("enqueueLatestDropStale provides isStale() for side-effect gating", async () => {
    const ch = createSerialWriteChannel()

    const applied: string[] = []

    const first = ch.enqueueLatestDropStale(async (isStale) => {
      await sleep(20)
      if (!isStale()) applied.push("first")
      return "first"
    })

    await sleep(1)

    const second = ch.enqueueLatestDropStale(async (isStale) => {
      await sleep(1)
      if (!isStale()) applied.push("second")
      return "second"
    })

    await first
    await second

    expect(applied).toEqual(["second"])
  })

  it("enqueueLatest rejects superseded pending task to avoid hangs", async () => {
    const ch = createSerialWriteChannel()

    const first = ch.enqueueLatest(async () => {
      await sleep(20)
      return "first"
    })
    await sleep(1)
    const second = ch.enqueueLatest(async () => {
      await sleep(10)
      return "second"
    })
    const third = ch.enqueueLatest(async () => "third")

    await expect(second).rejects.toBeInstanceOf(SupersededWriteError)
    await expect(first).resolves.toBe("first")
    await expect(third).resolves.toBe("third")
  })
})

