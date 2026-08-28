import { match } from "ts-pattern"

import { OutpostChainFamily } from "../deployments/index.js"
import { EthereumOutpostClient } from "./ethereum/EthereumOutpostClient.js"
import { SolanaOutpostClient } from "./solana/SolanaOutpostClient.js"
import { OutpostClientFor, OutpostClientInput } from "./Types.js"

/** Internal factory that owns family-specific client construction. */
export namespace OutpostClientFactory {
  /** Create the precise client selected by an outpost-family request. */
  export async function create<T extends OutpostClientInput>(
    input: T
  ): Promise<OutpostClientFor<T["family"]>> {
    const client = await match(input as OutpostClientInput)
      .with({ family: OutpostChainFamily.ethereum }, ({ options }) =>
        EthereumOutpostClient.create(options)
      )
      .with({ family: OutpostChainFamily.solana }, ({ options }) =>
        SolanaOutpostClient.create(options)
      )
      .exhaustive()

    return client as OutpostClientFor<T["family"]>
  }
}
