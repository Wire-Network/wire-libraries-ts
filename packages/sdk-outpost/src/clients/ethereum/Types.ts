import type {
  WithdrawalQueue,
  WithdrawalQueueV2,
  DepositManagerV3,
  LiqEthTokenV4
} from "@wireio/outpost-ethereum-artifacts-v0-4-3"
import type {
  BAR,
  OPP,
  OPPInbound,
  DepositManager,
  LiqEthToken,
  SyndicationPool
} from "@wireio/outpost-ethereum-artifacts"
import type { Provider, Signer } from "ethers"

import type { OutpostDeploymentProfile } from "../../deployments/index.js"
import { EthereumContractName } from "../../deployments/index.js"

/** Inputs required to connect an Ethereum outpost client. */
export interface EthereumOutpostClientOptions {
  /** Immutable deployment profile selected from the parent Wire chain. */
  profile: OutpostDeploymentProfile
  /** Ethers provider or connected signer for the target Ethereum chain. */
  connection: Provider | Signer
}

/** Generated contract clients keyed by their deployment identity. */
export interface EthereumContractMap {
  [EthereumContractName.WithdrawalQueue]: WithdrawalQueue
  [EthereumContractName.WithdrawalQueueV2]: WithdrawalQueueV2
  [EthereumContractName.DepositManagerV3]: DepositManagerV3
  [EthereumContractName.LiqEthTokenV4]: LiqEthTokenV4

  /** Native ETH deposit contract for the deployed liquid-staking suite. */
  [EthereumContractName.DepositManager]: DepositManager
  /** External liquid ETH token. */
  [EthereumContractName.LiqEthToken]: LiqEthToken
  /** Measured LIQ custody and OPP syndication contract. */
  [EthereumContractName.SyndicationPool]: SyndicationPool
  /** Bond and node-owner registration contract. */
  [EthereumContractName.BAR]: BAR
  /** Outbound OPP endpoint. */
  [EthereumContractName.OPP]: OPP
  /** Inbound OPP endpoint. */
  [EthereumContractName.OPPInbound]: OPPInbound
}
