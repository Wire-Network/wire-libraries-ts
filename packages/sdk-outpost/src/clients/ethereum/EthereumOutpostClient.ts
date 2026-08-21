import {
  BAR__factory,
  OPPInbound__factory,
  OPP__factory,
  OperatorRegistry__factory,
  ReserveManager__factory
} from "@wireio/outpost-ethereum-artifacts"
import type { Provider } from "ethers"
import { match } from "ts-pattern"

import {
  EthereumContractName,
  OutpostChainFamily
} from "../../deployments/index.js"
import { OutpostDeploymentVerifier } from "../../verification/index.js"
import { ethereumProvider } from "./Connection.js"
import { EthereumContractMap, EthereumOutpostClientOptions } from "./Types.js"
import { EthereumReserveClient } from "./EthereumReserveClient.js"
import { EthereumReserveSwapClient } from "./EthereumReserveSwapClient.js"
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
    return new EthereumOutpostClient(options, provider)
  }

  private constructor(
    private readonly options: EthereumOutpostClientOptions,
    /** Provider verified against the configured Ethereum chain. */
    readonly provider: Provider
  ) {
    this.reserves = new EthereumReserveClient(
      this.contract(EthereumContractName.ReserveManager),
      options.connection
    )
    this.swaps = new EthereumReserveSwapClient(
      this.contract(EthereumContractName.ReserveManager),
      options.connection
    )
    if (options.profile.ethereum.contracts[EthereumContractName.BAR] != null) {
      this.nodeOwnerClient = new EthereumNodeOwnerClient(
        this.contract(EthereumContractName.BAR),
        options.connection
      )
    }
  }

  /** Reserve creation, cancellation, and reads for this verified outpost. */
  readonly reserves: EthereumReserveClient

  /** Reserve-swap writes and balance reads for this verified outpost. */
  readonly swaps: EthereumReserveSwapClient

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
      contract = match(name as EthereumContractName)
        .with(EthereumContractName.BAR, () => {
          const bar = profile.ethereum.contracts[EthereumContractName.BAR]
          if (bar == null) {
            throw new Error(
              "Ethereum node owners are unavailable because this deployment profile has no BAR identity."
            )
          }
          return BAR__factory.connect(bar.address, connection)
        })
        .with(EthereumContractName.OPP, () =>
          OPP__factory.connect(
            profile.ethereum.contracts[EthereumContractName.OPP].address,
            connection
          )
        )
        .with(EthereumContractName.OPPInbound, () =>
          OPPInbound__factory.connect(
            profile.ethereum.contracts[EthereumContractName.OPPInbound].address,
            connection
          )
        )
        .with(EthereumContractName.OperatorRegistry, () =>
          OperatorRegistry__factory.connect(
            profile.ethereum.contracts[EthereumContractName.OperatorRegistry]
              .address,
            connection
          )
        )
        .with(EthereumContractName.ReserveManager, () =>
          ReserveManager__factory.connect(
            profile.ethereum.contracts[EthereumContractName.ReserveManager]
              .address,
            connection
          )
        )
        .exhaustive()

    return contract as EthereumContractMap[T]
  }
}
