import { Program } from "@coral-xyz/anchor"
import { match } from "ts-pattern"

import {
  OutpostChainFamily,
  SolanaProgramName
} from "../../deployments/index.js"
import { LiqsolCore, liqsolCoreIdl } from "../../programs/solana/index.js"
import { OutpostDeploymentVerifier } from "../../verification/index.js"
import { SolanaOutpostClientOptions, SolanaProgramMap } from "./Types.js"
import { SolanaReserveClient } from "./SolanaReserveClient.js"
import { SolanaReserveSwapClient } from "./SolanaReserveSwapClient.js"

/** Strictly typed access to one verified Solana outpost deployment. */
export class SolanaOutpostClient {
  /** Create the Solana backend for the package-level outpost client facade. */
  static async createSolana(
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
    this.reserves = new SolanaReserveClient(options.provider, this.liqsolCore)
    this.swaps = new SolanaReserveSwapClient(options.provider, this.liqsolCore)
  }

  /** Reserve creation, cancellation, and reads for this verified outpost. */
  readonly reserves: SolanaReserveClient

  /** Reserve-swap writes and balance reads for this verified outpost. */
  readonly swaps: SolanaReserveSwapClient

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
