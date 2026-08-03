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

/** Structural identity implemented by sdk-core ChainId objects. */
export interface WireChainIdLike {
  readonly hexString: string
}

/** Wire chain identity accepted from a hex string or sdk-core ChainId object. */
export type WireChainIdInput = string | WireChainIdLike

/** Resolve a deployment by its parent Wire chain identity or throw. */
export function assertOutpostDeployment(
  wireChainId: WireChainIdInput
): OutpostDeployment {
  const chainId =
    typeof wireChainId === "string"
      ? wireChainId.toLowerCase()
      : wireChainId.hexString.toLowerCase()

  if (!/^[0-9a-f]{64}$/.test(chainId)) {
    throw new Error(`Invalid Wire chain id ${chainId}`)
  }

  const deployment = OutpostDeployments.find(
    candidate => candidate.wire.chainId === chainId
  )

  if (deployment == null) {
    throw new Error(`No outpost deployment for Wire chain ${chainId}`)
  }
  return deployment
}
