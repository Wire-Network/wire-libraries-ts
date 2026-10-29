import { SolanaSyndicationClient } from "./SolanaSyndicationClient.js"
import { SolanaWithdrawalClient } from "./SolanaWithdrawalClient.js"
import { Program } from "@coral-xyz/anchor"
import type { LiqsolCore } from "@wireio/outpost-solana-artifacts"
import type { LiqsolCore as LiqsolCoreV044 } from "@wireio/outpost-solana-artifacts-v0-4-4"
import type { LiqsolCore as LiqsolCoreV042 } from "@wireio/outpost-solana-artifacts-v0-4-2"
import { match } from "ts-pattern"

import type { OutpostArtifactSuite } from "../../artifacts/Registry.js"
import {
  OutpostChainFamily,
  SolanaProgramName
} from "../../deployments/index.js"
import { OutpostDeploymentVerifier } from "../../verification/index.js"
import {
  SolanaOutpostClientOptions,
  SolanaProgramMap,
  type SolanaCoreProgram,
  hasConfigurableSyndicationMinimum,
  hasWithdrawalNonce
} from "./Types.js"

/** Strictly typed access to one verified Solana outpost deployment. */
export class SolanaOutpostClient {
  /** Create the Solana backend for the package-level outpost client facade. */
  static async create(
    options: SolanaOutpostClientOptions
  ): Promise<SolanaOutpostClient> {
    const { profile, provider } = options

    const artifactSuite = await OutpostDeploymentVerifier.verify({
      family: OutpostChainFamily.solana,
      profile,
      connection: provider.connection
    })
    return new SolanaOutpostClient(options, artifactSuite)
  }

  private readonly liqsolCore: SolanaCoreProgram

  private constructor(
    private readonly options: SolanaOutpostClientOptions,
    artifactSuite: OutpostArtifactSuite
  ) {
    const address =
      options.profile.solana.programs[SolanaProgramName.liqsolCore].address

    const idl = artifactSuite.solana.idls[SolanaProgramName.liqsolCore]
    // Anchor's constructor cannot infer its generic from the supplied IDL.
    this.liqsolCore = hasConfigurableSyndicationMinimum(idl)
      ? new Program<LiqsolCore>({ ...idl, address }, options.provider)
      : hasWithdrawalNonce(idl)
        ? new Program<LiqsolCoreV044>({ ...idl, address }, options.provider)
        : new Program<LiqsolCoreV042>({ ...idl, address }, options.provider)
  }

  /** Native deposits and PostLaunch syndication for explicit companion programs. */
  get syndication(): SolanaSyndicationClient {
    if (this.profile.solana.liqsol == null)
      throw new Error("Deployment profile has no liqSOL companion identities")
    return new SolanaSyndicationClient(
      this.liqsolCore,
      this.profile.solana.liqsol
    )
  }

  /** Provider verified against the configured Solana cluster. */
  get provider(): SolanaOutpostClientOptions["provider"] {
    return this.options.provider
  }

  /** User-owned native withdrawal requests and claims. */
  get withdrawals(): SolanaWithdrawalClient {
    return new SolanaWithdrawalClient(this.syndication)
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
