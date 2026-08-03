import { ChainId, ChainIdType } from "@wireio/sdk-core"

import {
  CurrentOutpostDeploymentId,
  OutpostDeploymentDocuments
} from "./generated/Catalog.js"
import { OutpostDeployment, parseOutpostDeployment } from "./Schema.js"

/** Deployment bundles available to SDK consumers. */
export const OutpostDeployments: readonly OutpostDeployment[] =
  OutpostDeploymentDocuments.map(parseOutpostDeployment)

/** Resolve a deployment by its stable catalog id or throw. */
export function getOutpostDeployment(id: string): OutpostDeployment {
  const deployment = OutpostDeployments.find(candidate => candidate.id === id)
  if (deployment == null) throw new Error(`No outpost deployment named ${id}`)
  return deployment
}

/** Deployment whose artifacts own the package's generated client types. */
export const CurrentOutpostDeployment = getOutpostDeployment(
  CurrentOutpostDeploymentId
)

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
