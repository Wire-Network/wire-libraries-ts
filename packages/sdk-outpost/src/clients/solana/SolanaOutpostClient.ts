import { Program } from "@coral-xyz/anchor"
import { PublicKey } from "@solana/web3.js"
import { match } from "ts-pattern"

import { SolanaProgramName } from "../../deployments/index.js"
import { LiqsolCore, liqsolCoreIdl } from "../../programs/solana/index.js"
import { SolanaOutpostClientOptions, SolanaProgramMap } from "./Types.js"

/** Strictly typed access to one verified Solana outpost deployment. */
export class SolanaOutpostClient {
  /** Create a client after verifying cluster identity and executable programs. */
  static async create(
    options: SolanaOutpostClientOptions
  ): Promise<SolanaOutpostClient> {
    const { deployment, provider } = options,
      genesisHash = await provider.connection.getGenesisHash()

    if (genesisHash !== deployment.solana.genesisHash) {
      throw new Error(
        `Solana genesis mismatch: expected ${deployment.solana.genesisHash}, received ${genesisHash}`
      )
    }

    await Promise.all(
      Object.values(SolanaProgramName).map(async programName => {
        const { address } = deployment.solana.programs[programName],
          account = await provider.connection.getAccountInfo(
            new PublicKey(address)
          )

        if (account == null || !account.executable) {
          throw new Error(
            `Solana program ${programName} is not executable at ${address}`
          )
        }
      })
    )
    return new SolanaOutpostClient(options)
  }

  private readonly liqsolCore: Program<LiqsolCore>

  private constructor(private readonly options: SolanaOutpostClientOptions) {
    this.liqsolCore = new Program<LiqsolCore>(liqsolCoreIdl, options.provider)
  }

  /** Provider verified against the configured Solana cluster. */
  get provider(): SolanaOutpostClientOptions["provider"] {
    return this.options.provider
  }

  /** Deployment used to verify and connect this client. */
  get deployment(): SolanaOutpostClientOptions["deployment"] {
    return this.options.deployment
  }

  /** Return a generated Anchor program client by typed deployment name. */
  program<T extends SolanaProgramName>(name: T): SolanaProgramMap[T] {
    const program = match(name as SolanaProgramName)
      .with(SolanaProgramName.liqsolCore, () => this.liqsolCore)
      .exhaustive()

    return program as SolanaProgramMap[T]
  }
}
