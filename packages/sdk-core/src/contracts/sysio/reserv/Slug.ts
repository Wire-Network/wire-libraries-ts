import { SlugName } from "../../../SlugName.js"
import type * as SysioContracts from "../../../types/SysioContractTypes.js"

import type { ReserveSlugName } from "./Types.js"

/** Converts a friendly slug string or packed value to its safe numeric form. */
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

/** Converts a friendly reserve slug to generated `slug_name` action data. */
export function reserveSlugData(
  value: ReserveSlugName
): SysioContracts.SysioReservSlugNameType {
  return { value: reserveSlugValue(value) }
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
