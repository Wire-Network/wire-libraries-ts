import type { Connection } from "@solana/web3.js"
import type { providers } from "ethers"

import type { OutpostDeploymentProfile } from "../deployments/index.js"
import { OutpostChainFamily } from "../deployments/index.js"

/** Ethereum verification request for an outpost deployment profile. */
export interface EthereumOutpostDeploymentVerificationInput {
  /** External-chain family discriminator. */
  family: OutpostChainFamily.ethereum
  /** Immutable deployment profile to verify. */
  profile: OutpostDeploymentProfile
  /** Ethereum provider connected to the deployed contracts. */
  provider: providers.Provider
}

/** Solana verification request for an outpost deployment profile. */
export interface SolanaOutpostDeploymentVerificationInput {
  /** External-chain family discriminator. */
  family: OutpostChainFamily.solana
  /** Immutable deployment profile to verify. */
  profile: OutpostDeploymentProfile
  /** Solana connection targeting the deployed program. */
  connection: Connection
}

/** Typed verification input accepted by the cross-chain verifier facade. */
export type OutpostDeploymentVerificationInput =
  | EthereumOutpostDeploymentVerificationInput
  | SolanaOutpostDeploymentVerificationInput
