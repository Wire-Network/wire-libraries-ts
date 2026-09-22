import { SlugName, slugValue } from "../../../SlugName.js"

import type { ReserveSlugName } from "./Types.js"

/**
 * Converts a reserve slug cell to its safe numeric form, in any carrier —
 * see {@link slugValue} for how each one is read.
 */
export function reserveSlugValue(value: ReserveSlugName): number {
  return slugValue(value, "Reserve")
}

/** Returns the display form of a packed reserve slug. */
export function reserveSlugString(value: ReserveSlugName): string {
  return SlugName.toString(reserveSlugValue(value))
}

/** Packs a chain/token pair exactly as the deployed `bychaintok` index does. */
export function reserveChainTokenIndexValue(
  chainCode: ReserveSlugName,
  tokenCode: ReserveSlugName
): bigint {
  return (
    (BigInt(reserveSlugValue(chainCode)) << 64n) |
    BigInt(reserveSlugValue(tokenCode))
  )
}
