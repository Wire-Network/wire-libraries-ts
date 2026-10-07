import type { Provider } from "ethers"
import { match } from "ts-pattern"

import {
  OutpostArtifactRegistry,
  type OutpostArtifactSuite
} from "../../artifacts/Registry.js"
import {
  EthereumContractName,
  OutpostChainFamily
} from "../../deployments/index.js"
import { OutpostDeploymentVerifier } from "../../verification/index.js"
import { ethereumProvider } from "./Connection.js"
import { EthereumContractMap, EthereumOutpostClientOptions } from "./Types.js"
import { EthereumNodeOwnerClient } from "./EthereumNodeOwnerClient.js"

/** Strictly typed access to one verified Ethereum outpost deployment. */
export class EthereumOutpostClient {
  /** Create the Ethereum backend for the package-level outpost client facade. */
  static async create(
    options: EthereumOutpostClientOptions
  ): Promise<EthereumOutpostClient> {
    const { connection, profile } = options,
      provider = ethereumProvider(connection)

    await OutpostDeploymentVerifier.verify({
      family: OutpostChainFamily.ethereum,
      profile,
      provider
    })
    return new EthereumOutpostClient(
      options,
      provider,
      OutpostArtifactRegistry.resolve(profile)
    )
  }

  private constructor(
    private readonly options: EthereumOutpostClientOptions,
    /** Provider verified against the configured Ethereum chain. */
    readonly provider: Provider,
    private readonly artifactSuite: OutpostArtifactSuite
  ) {
    if (options.profile.ethereum.contracts[EthereumContractName.BAR] != null) {
      this.nodeOwnerClient = new EthereumNodeOwnerClient(
        this.contract(EthereumContractName.BAR),
        options.connection
      )
    }
  }

  private readonly nodeOwnerClient?: EthereumNodeOwnerClient

  /** Node-owner slot reads, approvals, and BAR registration when deployed. */
  get nodeOwners(): EthereumNodeOwnerClient {
    if (this.nodeOwnerClient == null) {
      throw new Error(
        "Ethereum node owners are unavailable because this deployment profile has no BAR identity."
      )
    }
    return this.nodeOwnerClient
  }

  /** Deployment profile used to verify and connect this client. */
  get profile(): EthereumOutpostClientOptions["profile"] {
    return this.options.profile
  }

  /** Connect a generated contract client by its typed deployment name. */
  contract<T extends EthereumContractName>(name: T): EthereumContractMap[T] {
    const { connection, profile } = this.options,
      factories = this.artifactSuite.ethereum.factories,
      contract = match(name as EthereumContractName)
        .with(EthereumContractName.BAR, () => {
          const bar = profile.ethereum.contracts[EthereumContractName.BAR]
          if (bar == null) {
            throw new Error(
              "Ethereum node owners are unavailable because this deployment profile has no BAR identity."
            )
          }
          return factories[EthereumContractName.BAR].connect(
            bar.address,
            connection
          )
        })
        .with(EthereumContractName.OPP, () =>
          factories[EthereumContractName.OPP].connect(
            profile.ethereum.contracts[EthereumContractName.OPP].address,
            connection
          )
        )
        .with(EthereumContractName.OPPInbound, () =>
          factories[EthereumContractName.OPPInbound].connect(
            profile.ethereum.contracts[EthereumContractName.OPPInbound].address,
            connection
          )
        )
        .exhaustive()

    return contract as EthereumContractMap[T]
  }
}
