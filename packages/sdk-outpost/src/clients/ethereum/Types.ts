import type { providers, Signer } from "ethers"

import type {
  OPP,
  OPPInbound,
  OperatorRegistry,
  ReserveManager
} from "../../contracts/ethereum/index.js"
import type { OutpostDeploymentProfile } from "../../deployments/index.js"
import { EthereumContractName } from "../../deployments/index.js"

/** Inputs required to connect an Ethereum outpost client. */
export interface EthereumOutpostClientOptions {
  /** Immutable deployment profile selected from the parent Wire chain. */
  profile: OutpostDeploymentProfile
  /** Ethers provider or connected signer for the target Ethereum chain. */
  connection: providers.Provider | Signer
}

/** Generated contract clients keyed by their deployment identity. */
export interface EthereumContractMap {
  /** Outbound OPP endpoint. */
  [EthereumContractName.OPP]: OPP
  /** Inbound OPP endpoint. */
  [EthereumContractName.OPPInbound]: OPPInbound
  /** Operator collateral registry. */
  [EthereumContractName.OperatorRegistry]: OperatorRegistry
  /** Reserve custody manager. */
  [EthereumContractName.ReserveManager]: ReserveManager
}
