import type { AnchorProvider, Program } from "@coral-xyz/anchor"

import type { OutpostDeploymentProfile } from "../../deployments/index.js"
import { SolanaProgramName } from "../../deployments/index.js"
import type { LiqsolCore } from "@wireio/outpost-solana-artifacts"
import type { LiqsolCore as LiqsolCoreV042 } from "@wireio/outpost-solana-artifacts-v0-4-2"

/** Temporary Testnet IDL union; remove the retained type when Testnet adopts the RC. */
export type SupportedLiqsolCore = LiqsolCore | LiqsolCoreV042

/** Preserve each producer's complete generated Anchor program type. */
export type SolanaCoreProgram = Program<LiqsolCore> | Program<LiqsolCoreV042>

const WithdrawalRequestInstruction = "requestWithdraw",
  WithdrawalNonceArgument = "nonce"

/** Distinguish the supported, already verified producer instruction encodings. */
export function hasWithdrawalNonce(
  idl: SupportedLiqsolCore
): idl is LiqsolCore {
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
): program is Program<LiqsolCore> {
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
