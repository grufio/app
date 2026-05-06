/**
 * Centralised signed-URL TTLs (in seconds). Different audiences want
 * different freshness windows; collecting them here documents the
 * trade-off and prevents drift when a new caller picks an arbitrary
 * number out of habit.
 *
 * Trade-off shape:
 * - Shorter TTL  → fewer leaked URLs after revocation, more re-signs.
 * - Longer TTL   → fewer roundtrips, more risk if a URL escapes a
 *                  Cloudflare/CDN cache.
 */

export const SIGNED_URL_TTL = {
  /**
   * Master-image thumbnails on the dashboard / editor lists.
   * Short by design — these are visible in many places and we'd rather
   * re-sign than have a stale URL hang around.
   */
  thumbnail: 60 * 10, // 10 minutes

  /**
   * Filter working-copy URL passed into long-running pipelines / tab
   * reloads. The image is private to the owner anyway; an hour just
   * lets users keep editing without thrashing the storage API.
   */
  filterWorkingCopy: 60 * 60, // 1 hour
} as const

export type SignedUrlAudience = keyof typeof SIGNED_URL_TTL
