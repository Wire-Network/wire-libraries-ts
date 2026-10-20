import type {
  ExtendedAsset,
  SysioLiqAccountType,
  SysioLiqYieldIndexType,
  SysioSwapCurrencyStatsType
} from "../../../types/SysioContractTypes.js"

/** Public shadow state read at the pool's yield-leg contract for sysio.swap. */
export interface SwapYieldSnapshot {
  /** Holder row scoped to the swap contract; null means a verified absent row. */
  account: SysioLiqAccountType
  /** Current symbol index; null means a verified absent row. */
  index: SysioLiqYieldIndexType
}

/** Caller-owned snapshot for a depot-local, single-pair exact-input estimate. */
export interface SwapQuoteOptions {
  /** Generated pair row, including the issuing contracts and exact symbols. */
  pool: SysioSwapCurrencyStatsType
  /** Exact input token and quantity; its contract and precision must match a leg. */
  input: ExtendedAsset
  /** Explicit output tolerance in basis points, from 0 through 9999. */
  slippageBps: number
  /** Required for yield pools, even when the queried index/holder is absent. */
  yield?: SwapYieldSnapshot
}

/** Snapshot estimate only; neither execution readiness nor guaranteed settlement. */
export interface SwapQuote {
  /** Curve output before the output-denominated fee. */
  grossOutput: ExtendedAsset
  /** Pool fee, including the one-output-unit minimum for a nonzero rate. */
  fee: ExtendedAsset
  /** Exact-input output net of fees. */
  output: ExtendedAsset
  /** Output tolerance applied after fees, rounded downward. */
  minimumOutput: ExtendedAsset
  /** WIRE yield credited to the pool before the curve is evaluated. */
  accruedYield: ExtendedAsset
}
