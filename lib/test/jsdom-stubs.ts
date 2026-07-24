/**
 * Shared jsdom stubs for component/hook tests.
 *
 * jsdom implements neither a loading `Image` (its `onload` never fires) nor
 * `ResizeObserver`. These minimal fakes let the trace-preview tests mount and
 * drive load/measure behaviour. Install per test file via
 * `vi.stubGlobal("Image", FakeImage)` /
 * `vi.stubGlobal("ResizeObserver", FakeResizeObserver)`.
 */

/**
 * Minimal `Image` that fires `onload` on the next microtask, with a fixed
 * 100×75 natural size (the source size the trace-preview tests assert their
 * crop bitmap against).
 */
export class FakeImage {
  src = ""
  crossOrigin: string | null = null
  naturalWidth = 100
  naturalHeight = 75
  private _onload: (() => void) | null = null
  set onload(fn: (() => void) | null) {
    this._onload = fn
    if (fn) queueMicrotask(() => this._onload?.())
  }
  get onload(): (() => void) | null {
    return this._onload
  }
  onerror: (() => void) | null = null
}

/**
 * No-op `ResizeObserver` — never fires. Tests that don't depend on the
 * measured size only need construction not to throw.
 */
export class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/**
 * Install a static `window.matchMedia` for tests that render components using
 * `useIsMobile()` (jsdom has no `matchMedia`, and the hook reads it eagerly, so
 * an unstubbed render throws). `matches` selects the viewport the render sees:
 * `true` = mobile (header icons), `false` = desktop (footer text). Listeners are
 * no-ops — these tests assert a single static viewport, not resize transitions.
 */
export function installMatchMedia(matches = false): void {
  // Assign via `Object.defineProperty` — its descriptor `value` is typed `any`,
  // so no double type assertion is needed to satisfy the `MediaQueryList` shape
  // (which would count against the type-escape budget, as this file is not a
  // `*.test.ts`).
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}
