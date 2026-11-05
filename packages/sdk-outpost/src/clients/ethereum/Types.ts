import type { EthereumOutpostArtifactFactories } from "../../artifacts/Registry.js"
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

/** Each result is a binding from one of the supported producer packages. */
export type EthereumContractMap = {
  [Name in EthereumContractName]: ReturnType<
    EthereumOutpostArtifactFactories[Name]["connect"]
  >
}
