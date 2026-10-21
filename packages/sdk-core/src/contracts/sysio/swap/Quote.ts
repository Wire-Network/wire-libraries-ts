import { Asset } from "../../../chain/Asset.js"
import type { ExtendedAsset } from "../../../types/SysioContractTypes.js"
import type { SwapQuote, SwapQuoteOptions } from "./Types.js"

import {
  accruedPoolYield,
  assertQuoteTolerance,
  matches,
  poolAsset,
  units,
  SwapQuoteConstants
} from "./Pool.js"
export { SwapQuoteConstants } from "./Pool.js"

/**
 * Estimate one depot sysio.swap trade from caller-supplied public state.
 * Mirrors accrue -> out_given_in -> output fee, including shadow yield owed to
 * the swap contract. It performs no RPC, signing, ABI assembly or state mutation.
 * Callers must obtain a coherent snapshot, refresh before review, and enforce
 * minimum output on-chain. Missing yield state is never assumed to be zero.
 */
export function quoteSwap(options: SwapQuoteOptions): SwapQuote {
  const { pool, input, slippageBps } = options,
    { FeeDenominator, MaxAssetAmount, MinimumFee } = SwapQuoteConstants
  if (
    !Number.isInteger(pool.fee) ||
    pool.fee < 0 ||
    pool.fee >= Number(FeeDenominator)
  ) {
    throw new Error("Invalid pool fee")
  }
  assertQuoteTolerance(slippageBps)
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

  const accrued = accruedPoolYield(options)
  const poolIn = inFirst ? firstUnits : secondUnits + accrued,
    poolOut = inFirst ? secondUnits + accrued : firstUnits,
    outputLeg = inFirst ? pool.pool2 : pool.pool1
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
    asset = (value: bigint): ExtendedAsset => poolAsset(outputLeg, value)
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
