import { SlugName } from "../../../SlugName.js"
import type * as SysioContracts from "../../../types/SysioContractTypes.js"

import type { ChainSlugName } from "./Types.js"

/** Converts a friendly chain slug or packed value to its safe numeric form. */
export function chainSlugValue(value: ChainSlugName): number {
  const numericString = typeof value === "string" && /^[0-9]+$/.test(value),
    packed = numericString
      ? Number(value)
      : typeof value === "string"
        ? SlugName.from(value)
        : Number(value)

  if (!Number.isSafeInteger(packed) || packed <= 0) {
    throw new Error(
      "Chain slug must be a non-zero safe integer or valid slug_name string."
    )
  }

  return packed
}

/** Converts a friendly chain slug to generated `slug_name` action data. */
export function chainSlugData(
  value: ChainSlugName
): SysioContracts.SysioChainsSlugNameType {
  return { value: chainSlugValue(value) }
}

/** Returns the display form of a packed chain slug. */
export function chainSlugString(value: ChainSlugName): string {
  return SlugName.toString(chainSlugValue(value))
}
