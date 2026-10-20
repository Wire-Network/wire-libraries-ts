import type { Provider } from "ethers"

import type { OutpostArtifactSuite } from "../../artifacts/Registry.js"
import {
  EthereumContractName,
  OutpostChainFamily
} from "../../deployments/index.js"
import { OutpostDeploymentVerifier } from "../../verification/index.js"
import { ethereumProvider } from "./Connection.js"
import { EthereumContractMap, EthereumOutpostClientOptions } from "./Types.js"
import { EthereumSyndicationClient } from "./EthereumSyndicationClient.js"
import { EthereumWithdrawalClient } from "./EthereumWithdrawalClient.js"
import { EthereumNodeOwnerClient } from "./EthereumNodeOwnerClient.js"

/** Strictly typed access to one verified Ethereum outpost deployment. */
export class EthereumOutpostClient {
  /** Create the Ethereum backend for the package-level outpost client facade. */
  static async create(
    options: EthereumOutpostClientOptions
  ): Promise<EthereumOutpostClient> {
    const { connection, profile } = options,
      provider = ethereumProvider(connection)

    const artifactSuite = await OutpostDeploymentVerifier.verify({
      family: OutpostChainFamily.ethereum,
      profile,
      provider
    })
    return new EthereumOutpostClient(options, provider, artifactSuite)
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

  /** Native deposits and syndication for profiles carrying all three LIQ contracts. */
  get syndication(): EthereumSyndicationClient {
    return new EthereumSyndicationClient(
      this.depositManager,
      this.liquidToken,
      this.contract(EthereumContractName.SyndicationPool),
      this.options.connection
    )
  }

  /** Resolve an explicitly versioned deposit manager, rejecting ambiguous profiles. */
  private get depositManager() {
    const contracts = this.profile.ethereum.contracts
    if (contracts.DepositManager && contracts.DepositManagerV3)
      throw new Error("Deployment identifies multiple deposit managers")
    return contracts.DepositManagerV3
      ? this.contract(EthereumContractName.DepositManagerV3)
      : this.contract(EthereumContractName.DepositManager)
  }

  /** Resolve an explicitly versioned token, never infer an upgrade from an address. */
  private get liquidToken() {
    const contracts = this.profile.ethereum.contracts
    if (contracts.LiqEthToken && contracts.LiqEthTokenV4)
      throw new Error("Deployment identifies multiple liquid tokens")
    return contracts.LiqEthTokenV4
      ? this.contract(EthereumContractName.LiqEthTokenV4)
      : this.contract(EthereumContractName.LiqEthToken)
  }

  /** Native withdrawal requests and claims for a verified queue identity. */
  get withdrawals(): EthereumWithdrawalClient {
    const contracts = this.profile.ethereum.contracts
    if (contracts.WithdrawalQueue && contracts.WithdrawalQueueV2)
      throw new Error("Deployment identifies multiple withdrawal queues")
    if (!contracts.WithdrawalQueue && !contracts.WithdrawalQueueV2)
      throw new Error(
        "Deployment profile has no verified WithdrawalQueue identity"
      )
    return new EthereumWithdrawalClient(
      this.liquidToken,
      contracts.WithdrawalQueueV2
        ? this.contract(EthereumContractName.WithdrawalQueueV2)
        : this.contract(EthereumContractName.WithdrawalQueue),
      contracts.WithdrawalQueueV2
        ? undefined
        : this.contract(EthereumContractName.DepositManager),
      this.options.connection
    )
  }

  /** Deployment profile used to verify and connect this client. */
  get profile(): EthereumOutpostClientOptions["profile"] {
    return this.options.profile
  }

  /** Refuse optional capabilities that the deployment has not identified. */
  private assertContractAddress(name: EthereumContractName): string {
    const deployment = this.profile.ethereum.contracts[name]
    if (deployment == null)
      throw new Error(`Deployment profile has no ${name} identity`)
    return deployment.address
  }

  /** Connect a generated contract client by its typed deployment name. */
  contract<T extends EthereumContractName>(name: T): EthereumContractMap[T] {
    return this.artifactSuite.ethereum.factories[name].connect(
      this.assertContractAddress(name),
      this.options.connection
    ) as EthereumContractMap[T]
  }
}
