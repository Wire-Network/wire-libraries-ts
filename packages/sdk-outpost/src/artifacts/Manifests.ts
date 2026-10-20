import { EthereumOutpostArtifactManifest } from "@wireio/outpost-ethereum-artifacts-v0-4-3"
import { CurrentOutpostArtifactSuite } from "./Registry.js"

/** Exact producer manifests compiled into this SDK release. */
export const OutpostArtifactManifests = {
  ethereum: EthereumOutpostArtifactManifest,
  solana: CurrentOutpostArtifactSuite.solana.manifest
} as const
