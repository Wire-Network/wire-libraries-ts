import { EthereumOutpostArtifactManifest } from "@wireio/outpost-ethereum-artifacts"
import { SolanaOutpostArtifactManifest } from "@wireio/outpost-solana-artifacts"

/** Exact producer manifests compiled into this SDK release. */
export const OutpostArtifactManifests = {
  ethereum: EthereumOutpostArtifactManifest,
  solana: SolanaOutpostArtifactManifest
} as const
