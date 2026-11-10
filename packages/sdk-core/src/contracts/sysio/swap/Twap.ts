import { Asset } from "../../../chain/Asset.js"
import { Checksum256 } from "../../../chain/Checksum.js"
import { TimePoint } from "../../../chain/Time.js"
import type { SysioSwapCumulativePriceType } from "../../../types/SysioContractTypes.js"
import { matches, unsigned } from "./Pool.js"
import { poolAmounts, priceDecimal, PriceDecimalScale } from "./PriceMath.js"
import type {
  PoolPriceObservation,
  PoolTwap,
  PoolTwapOptions
} from "./PricingTypes.js"

/** Producer constants from sysio.opp.common/twap.hpp; unrelated to decimal price scaling. */
const PriceFractionBits = 64n,
  PriceOne = 1n << PriceFractionBits,
  AccumulatorLimbBits = 128n,
  MaxAccumulatorLimb = (1n << AccumulatorLimbBits) - 1n,
  MaxAccumulator = (1n << (AccumulatorLimbBits * 2n)) - 1n,
  MicrosecondDigits = 6,
  ChainTimePattern = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z?$/

/** Counterfactually advanced accumulators at one caller-specified chain time. */
interface ProjectedPrices {
  first: bigint
  second: bigint
  timeUs: bigint
  updateUs: bigint
}

/** Parse ABI time_point without Date's truncation of sub-millisecond digits. */
function chainTimeUs(value: string): bigint {
  const parts = ChainTimePattern.exec(value)
  if (!parts) throw new Error("Invalid chain observation time")
  return (
    BigInt(TimePoint.from(parts[1]).value.toString()) +
    BigInt((parts[2] || "").padEnd(MicrosecondDigits, "0"))
  )
}

/** Decode the generated two-limb accumulator without passing through Number. */
function accumulatorValue(value: SysioSwapCumulativePriceType): bigint {
  const lo = unsigned(value.lo, MaxAccumulatorLimb),
    hi = unsigned(value.hi, MaxAccumulatorLimb)
  return (hi << AccumulatorLimbBits) + lo
}

/** Advance a recorded interval locally; never submit sync or accrue hypothetical yield. */
function projectPrices(observation: PoolPriceObservation): ProjectedPrices {
  const { pool, accumulator, observedAt } = observation,
    amounts = poolAmounts(pool),
    timeUs = chainTimeUs(observedAt),
    updateUs = chainTimeUs(accumulator.last_update),
    elapsed = timeUs - updateUs
  if (updateUs < 0n || elapsed < 0n)
    throw new Error("Observation precedes the accumulator update")
  const first =
      accumulatorValue(accumulator.price1) +
      ((amounts.second * PriceOne) / amounts.first) * elapsed,
    second =
      accumulatorValue(accumulator.price2) +
      ((amounts.first * PriceOne) / amounts.second) * elapsed
  if (first > MaxAccumulator || second > MaxAccumulator)
    throw new Error("Price accumulator exceeds uint256 range")
  return { first, second, timeUs, updateUs }
}

/** Q64.64 integer average, then whole-token precision normalization and decimal formatting. */
function averagePrice(
  delta: bigint,
  elapsed: bigint,
  inputScale: bigint,
  outputScale: bigint
): string {
  if (delta < 0n) throw new Error("Price accumulator moved backwards")
  const average = delta / elapsed
  if (!average || average > MaxAccumulatorLimb)
    throw new Error("Invalid price accumulator interval")
  return priceDecimal(
    average * inputScale * PriceDecimalScale,
    PriceOne * outputScale
  )
}

/**
 * Average recorded-reserve prices over two coherent observations, in both directions.
 * Extends each accumulator to its supplied chain block time with recorded reserves,
 * so idle pools need no sync transaction. Never applies pending yield to past time.
 * Checks chain/pair identity and monotonicity; cannot prove RPC coherence, finality,
 * liquidity adequacy, or freshness. Opposite-direction TWAPs are not reciprocals.
 */
export function getPoolTwap(options: PoolTwapOptions): PoolTwap {
  const { start, end } = options
  if (
    !Checksum256.from(start.chainId).equals(Checksum256.from(end.chainId)) ||
    start.pool.issuer !== end.pool.issuer ||
    !Asset.from(start.pool.supply).symbol.equals(
      Asset.from(end.pool.supply).symbol
    ) ||
    !matches(start.pool.pool1, end.pool.pool1) ||
    !matches(start.pool.pool2, end.pool.pool2)
  )
    throw new Error("TWAP observations must identify the same chain and pool")
  if (
    accumulatorValue(end.accumulator.price1) <
      accumulatorValue(start.accumulator.price1) ||
    accumulatorValue(end.accumulator.price2) <
      accumulatorValue(start.accumulator.price2)
  )
    throw new Error("Price accumulator moved backwards")
  const earlier = projectPrices(start),
    later = projectPrices(end),
    elapsed = later.timeUs - earlier.timeUs,
    { firstScale, secondScale } = poolAmounts(end.pool)
  if (elapsed <= 0n)
    throw new Error("TWAP requires a positive observation window")
  if (later.updateUs < earlier.updateUs)
    throw new Error("Price accumulator update moved backwards")
  return {
    pool1InPool2: averagePrice(
      later.first - earlier.first,
      elapsed,
      firstScale,
      secondScale
    ),
    pool2InPool1: averagePrice(
      later.second - earlier.second,
      elapsed,
      secondScale,
      firstScale
    ),
    elapsedUs: elapsed.toString()
  }
}
