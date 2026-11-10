import type {
  ExtendedAsset,
  SysioSwapCurrencyStatsType,
  SysioSwapExtendedSymbolType,
  SysioSwapPriceAccumulatorType
} from "../../../types/SysioContractTypes.js"
import type { SwapPoolSnapshot } from "./Types.js"

/** Caller-supplied USD price of one whole token, identified by contract and precision. */
export interface PoolTokenPrice {
  /** Issuing contract and full precision/symbol of a leg in the supplied pool. */
  token: SysioSwapExtendedSymbolType
  /** Positive decimal string, with at most 18 fractional digits; never a JS float. */
  usd: string
}

/** Whether a USD price was supplied or inferred from this pool's effective reserves. */
export enum PoolPriceSource {
  /** Price supplied by the consumer. */
  reference = "reference",
  /** Price inferred from the other leg's reference and effective reserves. */
  pool = "pool"
}

/** Pure valuation inputs; reference selection and freshness remain caller policy. */
export interface PoolValuationOptions extends SwapPoolSnapshot {
  /** One reference derives the other leg; two references value both independently. */
  prices: readonly PoolTokenPrice[]
}

/** Effective pool reserve and its indicative USD value, not an executable quote. */
export interface PoolAssetValuation {
  /** Recorded reserve plus any accrued yield assigned to this leg. */
  reserve: ExtendedAsset
  /** USD per whole token, floored to at most 18 fractional digits. */
  priceUsd: string
  /** Reserve value computed before rounding the public price. */
  valueUsd: string
  /** Identifies which prices came from the caller rather than the pool. */
  priceSource: PoolPriceSource
}

/** Whole-token exchange rates, before fees/impact, rounded down to 18 decimals. */
export interface PoolPrices {
  /** Whole pool2 tokens for one whole pool1 token. */
  pool1InPool2: string
  /** Whole pool1 tokens for one whole pool2 token. */
  pool2InPool1: string
}

/** Snapshot display estimates; decimal outputs use the SDK's 18-decimal UInt256 scale. */
export interface PoolValuation extends PoolPrices {
  /** Valuation of the first leg in the supplied stat row. */
  pool1: PoolAssetValuation
  /** Valuation of the second leg, including accrued WIRE for a yield pool. */
  pool2: PoolAssetValuation
  /** Pending/banked WIRE accrued to pool2, using the same math as swap/LP quotes. */
  accruedYield: ExtendedAsset
  /** Effective reserves only; excludes deposits, reservoirs and external backing. */
  tvlUsd: string
  /** TVL per whole LP token, using total supply including locked shares. */
  lpTokenUsd: string
}

/** Coherent on-chain observation; observedAt is chain block time, not browser time. */
export interface PoolPriceObservation {
  /** Full Wire chain ID. Never combine observations from different chains/respins. */
  chainId: string
  /** The pool's recorded reserves at observedAt, without hypothetical yield accrual. */
  pool: SysioSwapCurrencyStatsType
  /** The matching priceaccum row at the same state as pool. */
  accumulator: SysioSwapPriceAccumulatorType
  /** UTC chain time in ABI time_point form, with up to six fractional digits. */
  observedAt: string
}

/** Two retained observations of the same chain, swap issuer, LP symbol and token pair. */
export interface PoolTwapOptions {
  /** Earlier coherent state, retained by the consumer. */
  start: PoolPriceObservation
  /** Later coherent state from the same chain and pool. */
  end: PoolPriceObservation
}

/** Historical recorded-reserve rates; the two directions are averaged independently. */
export interface PoolTwap extends PoolPrices {
  /** Exact positive window length in microseconds. */
  elapsedUs: string
}
