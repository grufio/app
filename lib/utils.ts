/**
 * Shared utility helpers.
 *
 * Responsibilities:
 * - Provide the `cn` helper for conditional Tailwind class composition.
 */
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
