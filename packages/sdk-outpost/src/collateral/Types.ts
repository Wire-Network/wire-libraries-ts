import type { SystemContracts } from "@wireio/sdk-core"

/** Native custody units, never reserve-normalized amounts. */
export interface OperatorCollateralRequest {
  /** Generated depot role; producers, batch operators and underwriters only. */
  operatorType: SystemContracts.SysioOpregOperatortype
  /** Positive u64 code for the configured native custody asset. */
  tokenCode: bigint
  /** Positive raw wei or lamports, without reserve normalization. */
  amount: bigint
  /** Latest depot bucket balance, including locked and queued collateral. */
  depotBalance: bigint
  /** Compressed or uncompressed SEC1 key for Ethereum; unused on Solana. */
  publicKey?: string
}

/** A source submission is not proof that the depot accepted the collateral. */
export interface OperatorCollateralSubmission {
  /** External-chain hash or signature, never a depot withdrawal queue ID. */
  transactionId: string
}

/** Retain the source identifier before confirmation can time out. */
export interface OperatorCollateralSubmissionOptions {
  /** Persist the receipt immediately after broadcast; never resubmit automatically on failure. */
  onSubmitted?: (submission: OperatorCollateralSubmission) => void
}

/** Operations supported by the selected producer artifact suite. */
export interface OperatorCollateralCapabilities {
  /** Whether this artifact suite exposes native operator collateral deposits. */
  nativeDeposit: boolean
  /** Whether this artifact suite exposes a public native operator withdrawal request. */
  nativeWithdrawal: boolean
}
