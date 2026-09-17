import type { EthereumOutpostClientOptions } from "./ethereum/index.js"
import type { EthereumOutpostClient as EthereumOutpostClientImplementation } from "./ethereum/EthereumOutpostClient.js"
import type { SolanaOutpostClientOptions } from "./solana/index.js"
import type { SolanaOutpostClient as SolanaOutpostClientImplementation } from "./solana/SolanaOutpostClient.js"
import { OutpostChainFamily } from "../deployments/index.js"

/** Verified Ethereum outpost client instance returned by `OutpostClient.create`. */
export type EthereumOutpostClient = EthereumOutpostClientImplementation

/** Verified Solana outpost client instance returned by `OutpostClient.create`. */
export type SolanaOutpostClient = SolanaOutpostClientImplementation

/** Request for an Ethereum outpost client. */
export interface EthereumOutpostClientInput {
  /** External-chain family discriminator. */
  family: OutpostChainFamily.ethereum
  /** Ethereum-specific client options. */
  options: EthereumOutpostClientOptions
}

/** Request for a Solana outpost client. */
export interface SolanaOutpostClientInput {
  /** External-chain family discriminator. */
  family: OutpostChainFamily.solana
  /** Solana-specific client options. */
  options: SolanaOutpostClientOptions
}

/** Typed request accepted by the cross-chain client facade. */
export type OutpostClientInput =
  | EthereumOutpostClientInput
  | SolanaOutpostClientInput

/** Concrete client types keyed by external-chain family. */
export interface OutpostClientMap {
  /** Ethereum client type. */
  [OutpostChainFamily.ethereum]: EthereumOutpostClient
  /** Solana client type. */
  [OutpostChainFamily.solana]: SolanaOutpostClient
}

/** Client returned for a selected external-chain family. */
export type OutpostClientFor<T extends OutpostChainFamily> = OutpostClientMap[T]
