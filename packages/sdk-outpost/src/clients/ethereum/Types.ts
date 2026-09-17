import type {
  BAR,
  OPP,
  OPPInbound,
  OperatorRegistry,
  ReserveManager
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
  /** Bond and node-owner registration contract. */
  [EthereumContractName.BAR]: BAR
  /** Outbound OPP endpoint. */
  [EthereumContractName.OPP]: OPP
  /** Inbound OPP endpoint. */
  [EthereumContractName.OPPInbound]: OPPInbound
  /** Operator collateral registry. */
  [EthereumContractName.OperatorRegistry]: OperatorRegistry
  /** Reserve custody manager. */
  [EthereumContractName.ReserveManager]: ReserveManager
}
