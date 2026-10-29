import type { AnchorProvider, Program } from "@coral-xyz/anchor"

import type { OutpostDeploymentProfile } from "../../deployments/index.js"
import { SolanaProgramName } from "../../deployments/index.js"
import type { LiqsolCore } from "@wireio/outpost-solana-artifacts"
import type { LiqsolCore as LiqsolCoreV044 } from "@wireio/outpost-solana-artifacts-v0-4-4"
import type { LiqsolCore as LiqsolCoreV042 } from "@wireio/outpost-solana-artifacts-v0-4-2"

/** Temporary pre-RC IDL union; remove retained types when all deployments adopt the RC. */
export type SupportedLiqsolCore = LiqsolCore | LiqsolCoreV044 | LiqsolCoreV042

/** Preserve each producer's complete generated Anchor program type. */
export type SolanaCoreProgram =
  | Program<LiqsolCore>
  | Program<LiqsolCoreV044>
  | Program<LiqsolCoreV042>

const GlobalConfigType = "globalConfig",
  SyndicationMinimumField = "minSyndicationPerTransfer",
  SyndicationMinimumError = "syndicationBelowMinimum",
  WithdrawalRequestInstruction = "requestWithdraw",
  WithdrawalNonceArgument = "nonce"

/** Identify the configurable-floor IDL after exact suite/runtime verification. */
export function hasConfigurableSyndicationMinimum(
  idl: SupportedLiqsolCore
): idl is LiqsolCore {
  return idl.types.some(
    type =>
      type.name === GlobalConfigType &&
      type.type.kind === "struct" &&
      type.type.fields.some(field => field.name === SyndicationMinimumField)
  )
}

/** Recognize the producer dust-floor guard; older Testnet has only a positive-amount check. */
export function hasSyndicationMinimum(idl: SupportedLiqsolCore): boolean {
  return idl.errors.some(error => error.name === SyndicationMinimumError)
}

/** Distinguish the supported, already verified producer instruction encodings. */
export function hasWithdrawalNonce(
  idl: SupportedLiqsolCore
): idl is LiqsolCore | LiqsolCoreV044 {
  return idl.instructions.some(
    instruction =>
      instruction.name === WithdrawalRequestInstruction &&
      instruction.args.some(
        argument => argument.name === WithdrawalNonceArgument
      )
  )
}

/** Narrow an Anchor client without widening or hand-declaring generated methods. */
export function hasConcurrentWithdrawals(
  program: SolanaCoreProgram
): program is Program<LiqsolCore> | Program<LiqsolCoreV044> {
  return hasWithdrawalNonce(program.idl)
}

/** Inputs required to connect a Solana outpost client. */
export interface SolanaOutpostClientOptions {
  /** Immutable deployment profile selected from the parent Wire chain. */
  profile: OutpostDeploymentProfile
  /** Anchor provider for the target Solana cluster. */
  provider: AnchorProvider
}

/** Generated program clients keyed by their deployment identity. */
export interface SolanaProgramMap {
  /** liqSOL core program deployed for this network group. */
  [SolanaProgramName.liqsolCore]: SolanaCoreProgram
}
