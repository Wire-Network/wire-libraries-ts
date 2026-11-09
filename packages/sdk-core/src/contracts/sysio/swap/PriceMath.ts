import BN from "bn.js"
import { Asset } from "../../../chain/Asset.js"
import { UInt256 } from "../../../chain/Integer.js"
import type { SysioSwapCurrencyStatsType } from "../../../types/SysioContractTypes.js"
import { matches, units } from "./Pool.js"

/** Existing SDK fixed-point scale; keep all intermediate arithmetic in bigint. */
export const PriceDecimalScale = BigInt(UInt256.SCALE.toString())

/** Internal exact ratio of USD base units; round only at the public display boundary. */
export interface PriceRatio {
  numerator: bigint
  denominator: bigint
}

/** Validated recorded reserves and whole-token scales, shared by spot and TWAP. */
export interface PoolAmounts {
  first: bigint
  second: bigint
  firstScale: bigint
  secondScale: bigint
}

/** Read positive, distinct pool legs without losing their precision or identity. */
export function poolAmounts(pool: SysioSwapCurrencyStatsType): PoolAmounts {
  const firstAsset = Asset.from(pool.pool1.quantity),
    secondAsset = Asset.from(pool.pool2.quantity),
    first = units(firstAsset),
    second = units(secondAsset)
  if (matches(pool.pool1, pool.pool2))
    throw new Error("Pool legs must be distinct")
  if (!first || !second) throw new Error("Pool reserves must be positive")
  return {
    first,
    second,
    firstScale: 10n ** BigInt(firstAsset.symbol.precision),
    secondScale: 10n ** BigInt(secondAsset.symbol.precision)
  }
}

/** Format a nonnegative ratio of USD/price base units using the existing SDK codec. */
export function priceDecimal(numerator: bigint, denominator = 1n): string {
  if (numerator < 0n || denominator <= 0n)
    throw new Error("Invalid price ratio")
  return UInt256.fromRaw(
    new BN((numerator / denominator).toString())
  ).toString()
}

/** Parse a positive caller-owned reference; no currency feed or peg is inferred. */
export function priceUnits(value: string): bigint {
  if (typeof value !== "string")
    throw new Error("Reference price must be a decimal string")
  const result = BigInt(UInt256.from(value).raw().toString())
  if (!result) throw new Error("Reference price must be positive")
  return result
}
