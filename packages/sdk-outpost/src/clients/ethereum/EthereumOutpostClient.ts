import { providers, Signer } from "ethers"
import { match } from "ts-pattern"

import { assertOutpostArtifactCompatibility } from "../../artifacts/index.js"
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
  private static readonly EmptyCode = "0x"

  /** Create a client after verifying chain identity and deployed bytecode. */
  static async create(
    options: EthereumOutpostClientOptions
  ): Promise<EthereumOutpostClient> {
    const { connection, deployment } = options,
      provider = resolveProvider(connection),
      network = await provider.getNetwork()

    assertOutpostArtifactCompatibility(deployment, OutpostChainFamily.ethereum)

    if (network.chainId !== deployment.ethereum.chainId) {
      throw new Error(
        `Ethereum chain mismatch: expected ${deployment.ethereum.chainId}, received ${network.chainId}`
      )
    }

    await Promise.all(
      Object.values(EthereumContractName).map(async contractName => {
        const { address } = deployment.ethereum.contracts[contractName],
          code = await provider.getCode(address)

        if (code === EthereumOutpostClient.EmptyCode) {
          throw new Error(
            `Ethereum contract ${contractName} is not deployed at ${address}`
          )
        }
      })
    )
    return new EthereumOutpostClient(options, provider)
  }

  private constructor(
    private readonly options: EthereumOutpostClientOptions,
    /** Provider verified against the configured Ethereum chain. */
    readonly provider: providers.Provider
  ) {}

  /** Deployment used to verify and connect this client. */
  get deployment(): EthereumOutpostClientOptions["deployment"] {
    return this.options.deployment
  }

  /** Connect a generated contract client by its typed deployment name. */
  contract<T extends EthereumContractName>(name: T): EthereumContractMap[T] {
    const { connection, deployment } = this.options,
      contract = match(name as EthereumContractName)
        .with(EthereumContractName.OPP, () =>
          OPP__factory.connect(
            deployment.ethereum.contracts[EthereumContractName.OPP].address,
            connection
          )
        )
        .with(EthereumContractName.OPPInbound, () =>
          OPPInbound__factory.connect(
            deployment.ethereum.contracts[EthereumContractName.OPPInbound]
              .address,
            connection
          )
        )
        .with(EthereumContractName.OperatorRegistry, () =>
          OperatorRegistry__factory.connect(
            deployment.ethereum.contracts[EthereumContractName.OperatorRegistry]
              .address,
            connection
          )
        )
        .with(EthereumContractName.ReserveManager, () =>
          ReserveManager__factory.connect(
            deployment.ethereum.contracts[EthereumContractName.ReserveManager]
              .address,
            connection
          )
        )
        .exhaustive()

    return contract as EthereumContractMap[T]
  }
}
