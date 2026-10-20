import { Asset } from "../../../chain/Asset.js"
import {
  accruedPoolYield,
  assertQuoteTolerance,
  poolAsset as asset,
  units,
  SwapQuoteConstants
} from "./Pool.js"
import type {
  AddLiquidityQuote,
  LiquidityQuoteOptions,
  RemoveLiquidityQuote
} from "./Types.js"

/** sysio.swap::ADD_LIQUIDITY_FEE: one basis point, charged separately per leg. */
const AddLiquidityFeeBps = 1n

/** Round a nonnegative rational upward, as the contract's share mint does. */
function ceil(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator
}

/** Validate exact shares and accrue yield before a share mint or burn. */
function snapshot(options: LiquidityQuoteOptions) {
  const { pool, slippageBps } = options,
    shares = Asset.from(options.shares),
    supply = Asset.from(pool.supply),
    locked = Asset.from(pool.locked_shares),
    maximum = Asset.from(pool.max_supply),
    amount = units(shares),
    total = units(supply),
    first = units(Asset.from(pool.pool1.quantity)),
    accrued = accruedPoolYield(options),
    second = units(Asset.from(pool.pool2.quantity)) + accrued
  if (
    !shares.symbol.equals(supply.symbol) ||
    !locked.symbol.equals(supply.symbol) ||
    !maximum.symbol.equals(supply.symbol)
  )
    throw new Error("LP share symbol mismatch")
  if (!amount || !total || !first || !second)
    throw new Error("Shares, supply and pool liquidity must be positive")
  if (units(locked) > total || total > units(maximum))
    throw new Error("Invalid LP supply bounds")
  assertQuoteTolerance(slippageBps)
  return {
    shares,
    amount,
    total,
    first,
    second,
    accrued,
    locked: units(locked)
  }
}

/**
 * Estimate exact LP shares minted: ceil each proportional input, then ceil its
 * one-basis-point fee. Maxima include caller tolerance. Depositing those maxima
 * can leave unspent internal balances; callers must expose their withdrawal.
 */
export function quoteAddLiquidity(
  options: LiquidityQuoteOptions
): AddLiquidityQuote {
  const state = snapshot(options),
    { pool, slippageBps } = options,
    { FeeDenominator, MaxAssetAmount } = SwapQuoteConstants,
    first = ceil(state.first * state.amount, state.total),
    second = ceil(state.second * state.amount, state.total),
    fee1 = ceil(first * AddLiquidityFeeBps, FeeDenominator),
    fee2 = ceil(second * AddLiquidityFeeBps, FeeDenominator),
    input1 = first + fee1,
    input2 = second + fee2,
    maximum1 = ceil(
      input1 * (FeeDenominator + BigInt(slippageBps)),
      FeeDenominator
    ),
    maximum2 = ceil(
      input2 * (FeeDenominator + BigInt(slippageBps)),
      FeeDenominator
    )
  if (
    state.total + state.amount > units(Asset.from(pool.max_supply)) ||
    state.total + state.amount > MaxAssetAmount
  )
    throw new Error("LP mint exceeds maximum supply")
  if (
    state.first + input1 > MaxAssetAmount ||
    state.second + input2 > MaxAssetAmount
  )
    throw new Error("LP mint exceeds the pool asset range")
  return {
    shares: state.shares.toString(),
    input1: asset(pool.pool1, input1),
    input2: asset(pool.pool2, input2),
    maximum1: asset(pool.pool1, maximum1),
    maximum2: asset(pool.pool2, maximum2),
    fee1: asset(pool.pool1, fee1),
    fee2: asset(pool.pool2, fee2),
    accruedYield: asset(pool.pool2, state.accrued)
  }
}

/**
 * Estimate a share burn: floor both outputs, enforce the locked-share floor,
 * then floor caller minimums. Outputs credit internal deposits, not wallets.
 * Ownership, Andon state and live ABI/auth checks remain the caller's concern.
 */
export function quoteRemoveLiquidity(
  options: LiquidityQuoteOptions
): RemoveLiquidityQuote {
  const state = snapshot(options),
    { pool, slippageBps } = options,
    { FeeDenominator } = SwapQuoteConstants,
    remaining = state.total - state.amount,
    first = (state.first * state.amount) / state.total,
    second = (state.second * state.amount) / state.total,
    factor = FeeDenominator - BigInt(slippageBps)
  if (remaining <= 0n || remaining < state.locked)
    throw new Error("Cannot remove locked shares or empty the pool")
  return {
    shares: state.shares.toString(),
    output1: asset(pool.pool1, first),
    output2: asset(pool.pool2, second),
    minimum1: asset(pool.pool1, (first * factor) / FeeDenominator),
    minimum2: asset(pool.pool2, (second * factor) / FeeDenominator),
    accruedYield: asset(pool.pool2, state.accrued)
  }
}
