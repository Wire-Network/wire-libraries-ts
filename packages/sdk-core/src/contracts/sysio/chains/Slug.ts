import { SlugName, slugValue } from "../../../SlugName.js"

import type { ChainSlugName } from "./Types.js"

/**
 * Converts a chain slug cell to its safe numeric form, in any carrier —
 * see {@link slugValue} for how each one is read.
 */
export function chainSlugValue(value: ChainSlugName): number {
  return slugValue(value, "Chain")
}

/** Returns the display form of a packed chain slug. */
export function chainSlugString(value: ChainSlugName): string {
  return SlugName.toString(chainSlugValue(value))
}
