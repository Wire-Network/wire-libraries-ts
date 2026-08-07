import type {
  EthereumOutpostClient,
  EthereumOutpostClientOptions
} from "./ethereum/index.js"
import type {
  SolanaOutpostClient,
  SolanaOutpostClientOptions
} from "./solana/index.js"
import { OutpostChainFamily } from "../deployments/index.js"

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
