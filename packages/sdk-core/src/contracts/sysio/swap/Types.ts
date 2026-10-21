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

/** Caller-owned pool and shadow state; all reads must describe one coherent snapshot. */
export interface SwapPoolSnapshot {
  /** Generated pair row, including the issuing contracts and exact symbols. */
  pool: SysioSwapCurrencyStatsType
  /** Required for yield pools, even when the queried index/holder is absent. */
  yield?: SwapYieldSnapshot
}

/** Caller-owned snapshot for a depot-local, single-pair exact-input estimate. */
export interface SwapQuoteOptions extends SwapPoolSnapshot {
  /** Exact input token, including its issuing contract and precision. */
  input: ExtendedAsset
  /** Explicit output tolerance in basis points, from 0 through 9999. */
  slippageBps: number
}

/** Exact share quantity for the contract's mint or burn operation. */
export interface LiquidityQuoteOptions extends SwapPoolSnapshot {
  /** LP asset with the pool's exact symbol and precision, never a JS float. */
  shares: string
  /** Maximum input / minimum output tolerance, in basis points from 0 to 9999. */
  slippageBps: number
}

/** Exact-share mint estimate. Unspent maximum deposits remain in internal custody. */
export interface AddLiquidityQuote {
  /** Exact LP share amount, including its symbol and precision. */
  shares: string
  /** First leg debit, including the liquidity fee. */
  input1: ExtendedAsset
  /** Second leg debit, including the liquidity fee. */
  input2: ExtendedAsset
  /** First leg maximum after upward-rounded tolerance. */
  maximum1: ExtendedAsset
  /** Second leg maximum after upward-rounded tolerance. */
  maximum2: ExtendedAsset
  /** Upward-rounded one-basis-point fee on the first leg. */
  fee1: ExtendedAsset
  /** Upward-rounded one-basis-point fee on the second leg. */
  fee2: ExtendedAsset
  /** WIRE yield accrued to the pool before pricing. */
  accruedYield: ExtendedAsset
}

/** Share burn credits both internal token balances; it does not send to a wallet. */
export interface RemoveLiquidityQuote {
  /** Exact LP share amount, including its symbol and precision. */
  shares: string
  /** First leg credited to internal deposits, rounded down. */
  output1: ExtendedAsset
  /** Second leg credited to internal deposits, rounded down. */
  output2: ExtendedAsset
  /** First leg minimum after downward-rounded tolerance. */
  minimum1: ExtendedAsset
  /** Second leg minimum after downward-rounded tolerance. */
  minimum2: ExtendedAsset
  /** WIRE yield accrued to the pool before pricing. */
  accruedYield: ExtendedAsset
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
