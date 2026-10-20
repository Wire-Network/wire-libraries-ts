import { Asset } from "../../../chain/Asset.js"
import type { ExtendedAsset } from "../../../types/SysioContractTypes.js"
import type { SwapPoolSnapshot } from "./Types.js"

/** Arithmetic constants pinned to sysio.swap and shadow_yield.hpp. */
export namespace SwapQuoteConstants {
  /** Basis-point denominator for the pool fee and caller's output tolerance. */
  export const FeeDenominator = 10_000n
  /** Smallest fee charged by a nonzero fee rate, in output units. */
  export const MinimumFee = 1n
  /** Cumulative WIRE-per-shadow-unit index scale. */
  export const YieldIndexScale = 1_000_000_000_000n
  /** Largest positive Antelope asset amount. */
  export const MaxAssetAmount = (1n << 62n) - 1n
  /** Largest value representable by the shadow index's uint128 ABI field. */
  export const MaxYieldIndex = (1n << 128n) - 1n
}

/** Reject lossy numbers and values outside the supplied unsigned domain. */
export function unsigned(value: number | string, maximum: bigint): bigint {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new Error("Quote state contains an unsafe integer")
  }
  if (!/^\d+$/.test(String(value)))
    throw new Error("Quote state contains an invalid integer")
  const result = BigInt(value)
  if (result > maximum) throw new Error("Quote state exceeds its integer range")
  return result
}

/** Parse exact nonnegative token units without converting through a JS number. */
export function units(asset: Asset): bigint {
  return unsigned(asset.units.toString(), SwapQuoteConstants.MaxAssetAmount)
}

/** Determine whether the input identifies this exact contract and symbol. */
export function matches(input: ExtendedAsset, leg: ExtendedAsset): boolean {
  return (
    input.contract === leg.contract &&
    Asset.from(input.quantity).symbol.equals(Asset.from(leg.quantity).symbol)
  )
}

/** Yield credited to the second leg before a trade or a share mint/burn. */
export function accruedPoolYield(options: SwapPoolSnapshot): bigint {
  const { pool } = options,
    first = Asset.from(pool.pool1.quantity),
    secondUnits = units(Asset.from(pool.pool2.quantity)),
    { MaxAssetAmount, MaxYieldIndex, YieldIndexScale } = SwapQuoteConstants
  let accrued = 0n
  if (pool.yield_leg) {
    if (
      pool.yield_leg.contract !== pool.pool1.contract ||
      !Asset.Symbol.from(pool.yield_leg.sym).equals(first.symbol)
    ) {
      throw new Error("Yield leg must be the first pool leg")
    }
    if (!options.yield)
      throw new Error("Yield pool requires its holder and index snapshot")
    const { account, index } = options.yield,
      current = index ? unsigned(index.index, MaxYieldIndex) : 0n
    if (current && account) {
      const balance = Asset.from(account.balance),
        checkpoint = unsigned(account.index_checkpoint, MaxYieldIndex)
      if (!balance.symbol.equals(first.symbol))
        throw new Error("Yield holder symbol mismatch")
      if (checkpoint > current)
        throw new Error("Yield index precedes the holder checkpoint")
      const product = units(balance) * (current - checkpoint)
      if (product > MaxYieldIndex)
        throw new Error("Yield product exceeds uint128 range")
      accrued =
        unsigned(account.owed_wire, MaxAssetAmount) + product / YieldIndexScale
    }
  }
  if (accrued > MaxAssetAmount || secondUnits + accrued > MaxAssetAmount) {
    throw new Error("Accrued yield exceeds the pool asset range")
  }
  return accrued
}

/** Validate explicit basis-point tolerance shared by swap and LP estimates. */
export function assertQuoteTolerance(value: number): void {
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value >= Number(SwapQuoteConstants.FeeDenominator)
  )
    throw new Error("Invalid quote tolerance")
}

/** Render exact nonnegative base units in a pool leg's issuing contract/precision. */
export function poolAsset(leg: ExtendedAsset, amount: bigint): ExtendedAsset {
  if (amount < 0n || amount > SwapQuoteConstants.MaxAssetAmount)
    throw new Error("Quote amount exceeds the asset range")
  return {
    contract: leg.contract,
    quantity: Asset.fromUnits(
      amount.toString(),
      Asset.from(leg.quantity).symbol
    ).toString()
  }
}
