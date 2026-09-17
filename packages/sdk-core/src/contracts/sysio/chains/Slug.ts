import { SlugName } from "../../../SlugName.js"

import type { ChainSlugName } from "./Types.js"

/**
 * Converts a friendly chain slug or packed value to its safe numeric form.
 *
 * A string is ALWAYS parsed as a slug, never as a decimal — and that is
 * unambiguous because a code must start with a letter, so no legal spelling can
 * be read as a number. Pass a `number` to supply an already-packed value.
 */
export function chainSlugValue(value: ChainSlugName): number {
  const packed = typeof value === "string" ? SlugName.from(value) : Number(value)

  if (!Number.isSafeInteger(packed) || packed <= 0) {
    throw new Error(
      "Chain slug must be a non-zero safe integer or valid slug_name string."
    )
  }

  return packed
}

/** Returns the display form of a packed chain slug. */
export function chainSlugString(value: ChainSlugName): string {
  return SlugName.toString(chainSlugValue(value))
}
