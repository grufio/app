/**
 * Mobile editor sections — single source of truth.
 *
 * The four section names that drive the mobile bottom-nav, the
 * shell's `mobileSection` state, and `deriveDisplayLayers`'
 * section-gating live here as a `const` tuple. Importing the type
 * from one place keeps the three consumers from drifting (Sprint 2
 * already trimmed "output" out — adding a new section is now a
 * one-edit affair).
 */
export const MOBILE_SECTIONS = ["artboard", "filter", "trace", "colors"] as const

export type MobileSection = (typeof MOBILE_SECTIONS)[number]
