import { describe, expect, it, vi } from "vitest"

import { executeFocusReturn } from "./use-dialog-focus-return"

function fakeTrigger() {
  return { focus: vi.fn() } as unknown as HTMLElement
}

describe("executeFocusReturn", () => {
  it("focuses the trigger and prevents default when present and attached", () => {
    const trigger = fakeTrigger()
    const preventDefault = vi.fn()
    const result = executeFocusReturn({
      trigger,
      contains: () => true,
      preventDefault,
    })
    expect(result).toBe("focused")
    expect(trigger.focus).toHaveBeenCalledTimes(1)
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it("no-ops when no trigger was captured", () => {
    const preventDefault = vi.fn()
    const result = executeFocusReturn({
      trigger: null,
      contains: () => true,
      preventDefault,
    })
    expect(result).toBe("noop_missing")
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it("no-ops when the trigger has been detached from the DOM", () => {
    const trigger = fakeTrigger()
    const preventDefault = vi.fn()
    const result = executeFocusReturn({
      trigger,
      contains: () => false,
      preventDefault,
    })
    expect(result).toBe("noop_detached")
    expect(trigger.focus).not.toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()
  })
})
