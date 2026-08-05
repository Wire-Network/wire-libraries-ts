import { providers, Signer } from "ethers"
import { match } from "ts-pattern"

import {
  OPPInbound__factory,
  OPP__factory,
  OperatorRegistry__factory,
  ReserveManager__factory
} from "../../contracts/ethereum/index.js"
import {
  EthereumContractName,
  OutpostChainFamily
} from "../../deployments/index.js"
import { OutpostDeploymentVerifier } from "../../verification/index.js"
import { EthereumContractMap, EthereumOutpostClientOptions } from "./Types.js"

function resolveProvider(
  connection: providers.Provider | Signer
): providers.Provider {
  if (!Signer.isSigner(connection)) return connection
  if (connection.provider == null) {
    throw new Error("Ethereum signer must be connected to a provider")
  }
  return connection.provider
}

/** Strictly typed access to one verified Ethereum outpost deployment. */
export class EthereumOutpostClient {
  /** Create a client after verifying its interface and exact live implementation. */
  static async create(
    options: EthereumOutpostClientOptions
  ): Promise<EthereumOutpostClient> {
    const { connection, profile } = options,
      provider = resolveProvider(connection)

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
    readonly provider: providers.Provider
  ) {}

  /** Deployment profile used to verify and connect this client. */
  get profile(): EthereumOutpostClientOptions["profile"] {
    return this.options.profile
  }

  /** Connect a generated contract client by its typed deployment name. */
  contract<T extends EthereumContractName>(name: T): EthereumContractMap[T] {
    const { connection, profile } = this.options,
      contract = match(name as EthereumContractName)
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
