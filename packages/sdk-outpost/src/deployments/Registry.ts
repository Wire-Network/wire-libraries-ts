import { ChainId, ChainIdType } from "@wireio/sdk-core"

import { Sim2Deployment } from "./Sim2.js"
import { OutpostDeployment } from "./Schema.js"

/** Deployment bundles available to SDK consumers. */
export const OutpostDeployments: readonly OutpostDeployment[] = [Sim2Deployment]

/** Resolve a deployment by its parent Wire chain identity or throw. */
export function assertOutpostDeployment(
  wireChainId: ChainIdType
): OutpostDeployment {
  const chainId = ChainId.from(wireChainId),
    deployment = OutpostDeployments.find(candidate =>
      candidate.wire.chainId.equals(chainId)
    )

  if (deployment == null) {
    throw new Error(`No outpost deployment for Wire chain ${chainId.hexString}`)
  }
  return deployment
}
