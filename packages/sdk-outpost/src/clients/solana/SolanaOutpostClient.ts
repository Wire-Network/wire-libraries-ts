import { Program } from "@coral-xyz/anchor"
import { match } from "ts-pattern"

import {
  OutpostChainFamily,
  SolanaProgramName
} from "../../deployments/index.js"
import { LiqsolCore, liqsolCoreIdl } from "../../programs/solana/index.js"
import { OutpostDeploymentVerifier } from "../../verification/index.js"
import { SolanaOutpostClientOptions, SolanaProgramMap } from "./Types.js"

/** Strictly typed access to one verified Solana outpost deployment. */
export class SolanaOutpostClient {
  /** Create a client after verifying its interface and exact live program data. */
  static async create(
    options: SolanaOutpostClientOptions
  ): Promise<SolanaOutpostClient> {
    const { profile, provider } = options

    await OutpostDeploymentVerifier.verify({
      family: OutpostChainFamily.solana,
      profile,
      connection: provider.connection
    })
    return new SolanaOutpostClient(options)
  }

  private readonly liqsolCore: Program<LiqsolCore>

  private constructor(private readonly options: SolanaOutpostClientOptions) {
    const address =
      options.profile.solana.programs[SolanaProgramName.liqsolCore].address

    this.liqsolCore = new Program<LiqsolCore>(
      { ...liqsolCoreIdl, address },
      options.provider
    )
  }

  /** Provider verified against the configured Solana cluster. */
  get provider(): SolanaOutpostClientOptions["provider"] {
    return this.options.provider
  }

  /** Deployment profile used to verify and connect this client. */
  get profile(): SolanaOutpostClientOptions["profile"] {
    return this.options.profile
  }

  /** Return a generated Anchor program client by typed deployment name. */
  program<T extends SolanaProgramName>(name: T): SolanaProgramMap[T] {
    const program = match(name as SolanaProgramName)
      .with(SolanaProgramName.liqsolCore, () => this.liqsolCore)
      .exhaustive()

    return program as SolanaProgramMap[T]
  }
}
