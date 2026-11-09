import type { AnchorProvider, Program } from "@coral-xyz/anchor"

import type { OutpostDeploymentProfile } from "../../deployments/index.js"
import { SolanaProgramName } from "../../deployments/index.js"
import type { LiqsolCore } from "@wireio/outpost-solana-artifacts"
/** Producer-owned IDL and program types for the supported release. */
export type SupportedLiqsolCore = LiqsolCore
export type SolanaCoreProgram = Program<LiqsolCore>

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
