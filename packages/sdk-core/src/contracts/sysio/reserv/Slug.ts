import { SlugName } from "../../../SlugName.js"

import type { ReserveSlugName } from "./Types.js"

/**
 * Converts a friendly slug string or packed value to its safe numeric form.
 *
 * A string is ALWAYS parsed as a slug, never as a decimal — and that is
 * unambiguous because a code must start with a letter, so no legal spelling can
 * be read as a number. Pass a `number` to supply an already-packed value.
 */
export function reserveSlugValue(value: ReserveSlugName): number {
  const packed =
    typeof value === "string" ? SlugName.from(value) : Number(value)

  if (!Number.isSafeInteger(packed) || packed <= 0) {
    throw new Error(
      "Reserve slug must be a non-zero safe integer or valid slug_name string."
    )
  }

  return packed
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
