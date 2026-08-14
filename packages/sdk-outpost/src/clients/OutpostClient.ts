import { match } from "ts-pattern"

import { OutpostChainFamily } from "../deployments/index.js"
import { EthereumOutpostClient } from "./ethereum/EthereumOutpostClient.js"
import { SolanaOutpostClient } from "./solana/SolanaOutpostClient.js"
import { OutpostClientFor, OutpostClientInput } from "./Types.js"

/** Cross-chain facade for creating a verified, family-specific outpost client. */
export namespace OutpostClient {
  /** Create the precise client type selected by the request discriminator. */
  export async function create<T extends OutpostClientInput>(
    input: T
  ): Promise<OutpostClientFor<T["family"]>> {
    const client = await match(input as OutpostClientInput)
      .with({ family: OutpostChainFamily.ethereum }, ({ options }) =>
        EthereumOutpostClient.createEthereum(options)
      )
      .with({ family: OutpostChainFamily.solana }, ({ options }) =>
        SolanaOutpostClient.createSolana(options)
      )
      .exhaustive()

    return client as OutpostClientFor<T["family"]>
  }
}
