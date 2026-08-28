import { OutpostClientFactory } from "./OutpostClientFactory.js"
import { OutpostClientFor, OutpostClientInput } from "./Types.js"

/** Cross-chain facade for creating a verified, family-specific outpost client. */
export namespace OutpostClient {
  /** Create the precise client type selected by the request discriminator. */
  export async function create<T extends OutpostClientInput>(
    input: T
  ): Promise<OutpostClientFor<T["family"]>> {
    return OutpostClientFactory.create(input)
  }
}
