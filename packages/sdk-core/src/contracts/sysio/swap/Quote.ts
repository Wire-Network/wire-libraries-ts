import { Asset } from "../../../chain/Asset.js"
import type { ExtendedAsset } from "../../../types/SysioContractTypes.js"
import type { SwapQuote, SwapQuoteOptions } from "./Types.js"

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
function unsigned(value: number | string, maximum: bigint): bigint {
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
function units(asset: Asset): bigint {
  return unsigned(asset.units.toString(), SwapQuoteConstants.MaxAssetAmount)
}

/** Determine whether the input identifies this exact contract and symbol. */
function matches(input: ExtendedAsset, leg: ExtendedAsset): boolean {
  return (
    input.contract === leg.contract &&
    Asset.from(input.quantity).symbol.equals(Asset.from(leg.quantity).symbol)
  )
}

/**
 * Estimate one depot sysio.swap trade from caller-supplied public state.
 * Mirrors accrue -> out_given_in -> output fee, including shadow yield owed to
 * the swap contract. It performs no RPC, signing, ABI assembly or state mutation.
 * Callers must obtain a coherent snapshot, refresh before review, and enforce
 * minimum output on-chain. Missing yield state is never assumed to be zero.
 */
export function quoteSwap(options: SwapQuoteOptions): SwapQuote {
  const { pool, input, slippageBps } = options,
    {
      FeeDenominator,
      MaxAssetAmount,
      MaxYieldIndex,
      YieldIndexScale,
      MinimumFee
    } = SwapQuoteConstants
  if (
    !Number.isInteger(pool.fee) ||
    pool.fee < 0 ||
    pool.fee >= Number(FeeDenominator)
  ) {
    throw new Error("Invalid pool fee")
  }
  if (
    !Number.isInteger(slippageBps) ||
    slippageBps < 0 ||
    slippageBps >= Number(FeeDenominator)
  ) {
    throw new Error("Invalid quote tolerance")
  }
  const first = Asset.from(pool.pool1.quantity),
    second = Asset.from(pool.pool2.quantity),
    amount = units(Asset.from(input.quantity)),
    firstUnits = units(first),
    secondUnits = units(second),
    inFirst = matches(input, pool.pool1),
    inSecond = matches(input, pool.pool2)
  if (inFirst === inSecond)
    throw new Error("Input must match exactly one pool leg")
  if (!amount || !firstUnits || !secondUnits)
    throw new Error("Input and pool liquidity must be positive")

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
  const poolIn = inFirst ? firstUnits : secondUnits + accrued,
    poolOut = inFirst ? secondUnits + accrued : firstUnits,
    outputLeg = inFirst ? pool.pool2 : pool.pool1,
    outputSymbol = inFirst ? second.symbol : first.symbol
  if (poolIn + amount > MaxAssetAmount)
    throw new Error("Input exceeds the pool asset range")
  const gross = (poolOut * amount) / (poolIn + amount),
    proportionalFee = (gross * BigInt(pool.fee)) / FeeDenominator,
    fee =
      pool.fee && gross
        ? proportionalFee > MinimumFee
          ? proportionalFee
          : MinimumFee
        : 0n,
    output = gross - fee,
    minimum =
      (output * (FeeDenominator - BigInt(slippageBps))) / FeeDenominator,
    asset = (value: bigint): ExtendedAsset => ({
      contract: outputLeg.contract,
      quantity: Asset.fromUnits(value.toString(), outputSymbol).toString()
    })
  return {
    grossOutput: asset(gross),
    fee: asset(fee),
    output: asset(output),
    minimumOutput: asset(minimum),
    accruedYield: {
      contract: pool.pool2.contract,
      quantity: Asset.fromUnits(accrued.toString(), second.symbol).toString()
    }
  }
}
