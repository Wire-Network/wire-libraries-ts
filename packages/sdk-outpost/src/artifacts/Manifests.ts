import { CurrentOutpostArtifactSuite } from "./Registry.js"

/** Exact producer manifests compiled into this SDK release. */
export const OutpostArtifactManifests = {
  ethereum: CurrentOutpostArtifactSuite.ethereum.manifest,
  solana: CurrentOutpostArtifactSuite.solana.manifest
} as const
