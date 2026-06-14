const USER_KEY = "spanish-trainer:user";

export type UserId = "admin" | "q" | "r";

export const USERS = [
  { id: "admin", label: "Admin" },
  { id: "q", label: "Q" },
  { id: "r", label: "R" },
] as const satisfies ReadonlyArray<{ id: UserId; label: string }>;

export const DEFAULT_USER: UserId = "admin";

function isUserId(value: string | null): value is UserId {
  return value === "admin" || value === "q" || value === "r";
}

/** The currently selected profile (defaults to Admin). */
export function getActiveUser(): UserId {
  if (typeof window === "undefined") return DEFAULT_USER;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return isUserId(raw) ? raw : DEFAULT_USER;
  } catch {
    return DEFAULT_USER;
  }
}

export function setActiveUser(id: UserId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(USER_KEY, id);
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

/**
 * One-time migration: adopt the old un-namespaced keys for the Admin profile so
 * existing progress isn't lost when profiles are introduced. Safe to call
 * repeatedly — it only acts while a legacy key is still present.
 */
export function migrateLegacy(): void {
  if (typeof window === "undefined") return;
  const moves: [from: string, to: string][] = [
    ["spanish-trainer:srs", "spanish-trainer:srs:admin"],
    ["spanish-trainer:highscore", "spanish-trainer:highscore:admin"],
  ];
  try {
    for (const [from, to] of moves) {
      const legacy = window.localStorage.getItem(from);
      if (legacy !== null && window.localStorage.getItem(to) === null) {
        window.localStorage.setItem(to, legacy);
        window.localStorage.removeItem(from);
      }
    }
  } catch {
    /* ignore */
  }
}
