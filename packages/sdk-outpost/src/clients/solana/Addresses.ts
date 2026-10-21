import { PublicKey } from "@solana/web3.js"

/** Canonical core and companion PDA seeds shared by user transaction builders. */
export const SolanaSeeds = {
  global: "global",
  receiptData: "liq_receipt_data",
  receiptMint: "mint",
  mintMetadata: "mint_metadata",
  stakeAllocationState: "stake_allocation_state",
  stakeMetrics: "stake_metrics",
  maintenanceLedger: "maintenance_ledger",
  globalState: "outpost_global_state",
  globalConfig: "global_config",
  distributionState: "distribution_state",
  poolAuthority: "liqsol_pool",
  bucketAuthority: "liqsol_bucket",
  userRecord: "user_record",
  liqsolMint: "liqsol_mint",
  mintAuthority: "mint_authority",
  extraAccountMetaList: "extra-account-metas",
  reservePool: "reserve_pool",
  depositAuthority: "deposit_authority",
  vault: "vault",
  controllerState: "stake_controller",
  payoutState: "payout_state",
  payRateHistory: "pay_rate_history",
  config: "outpost_config",
  outboundMessageBuffer: "outbound_message_buffer"
} as const

/** Derive a program-owned address without caller-owned or environment-specific state. */
export function solanaProgramAddress(
  program: PublicKey,
  seed: string,
  ...rest: Buffer[]
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(seed), ...rest],
    program
  )[0]
}
