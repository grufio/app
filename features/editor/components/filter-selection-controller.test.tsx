/**
 * @vitest-environment jsdom
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const toastError = vi.fn()
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }))

import { FilterSelectionController } from "./FilterSelectionController"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const btn = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement

afterEach(() => toastError.mockReset())

async function renderAndApply(onApply: (id: string) => Promise<void>, onClose = vi.fn()) {
  render(<FilterSelectionController open workingImageUrl="u" onClose={onClose} onApply={onApply} />)
  expect(btn("Apply").disabled).toBe(true) // nothing selected yet
  await act(async () => {
    fireEvent.click(btn("B&W Hard"))
  })
  expect(btn("Apply").disabled).toBe(false)
  await act(async () => {
    fireEvent.click(btn("Apply"))
  })
  return { onClose }
}

describe("FilterSelectionController — awaits the apply, owns busy + error toast", () => {
  it("stays open + busy during the apply, closes on success", async () => {
    const d = deferred<void>()
    const onApply = vi.fn(() => d.promise)
    const { onClose } = await renderAndApply(onApply)

    // Awaited: onApply called, picker busy (Apply disabled), NOT closed yet.
    expect(onApply).toHaveBeenCalledWith("bw_hard")
    expect(btn("Apply").disabled).toBe(true)
    expect(btn("Cancel").disabled).toBe(true)
    expect(onClose).not.toHaveBeenCalled()

    await act(async () => {
      d.resolve()
      await d.promise
    })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(toastError).not.toHaveBeenCalled()
  })

  it("stays open + toasts exactly once on failure (no auto-close)", async () => {
    const d = deferred<void>()
    const onApply = vi.fn(() => d.promise)
    const { onClose } = await renderAndApply(onApply)

    await act(async () => {
      d.reject(new Error("boom"))
      await d.promise.catch(() => {})
    })

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
    expect(onClose).not.toHaveBeenCalled()
    // Busy cleared → the user can retry.
    expect(btn("Apply").disabled).toBe(false)
  })
})
