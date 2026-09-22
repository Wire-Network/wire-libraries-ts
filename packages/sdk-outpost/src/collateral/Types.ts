import type { SystemContracts } from "@wireio/sdk-core"

/** Native custody units, never reserve-normalized amounts. */
export interface OperatorCollateralRequest {
  operatorType: SystemContracts.SysioOpregOperatortype
  tokenCode: bigint
  amount: bigint
  /** Latest depot bucket balance, including locked and queued collateral. */
  depotBalance: bigint
  /** Compressed or uncompressed SEC1 key for Ethereum; unused on Solana. */
  publicKey?: string
}

/** A source submission is not proof that the depot accepted the collateral. */
export interface OperatorCollateralSubmission {
  transactionId: string
}

/** Retain the source identifier before confirmation can time out. */
export interface OperatorCollateralSubmissionOptions {
  onSubmitted?: (submission: OperatorCollateralSubmission) => void
}

/** Operations supported by the selected producer artifact suite. */
export interface OperatorCollateralCapabilities {
  nativeDeposit: boolean
  nativeWithdrawal: boolean
}
