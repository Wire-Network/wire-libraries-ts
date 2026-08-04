import { fileURLToPath } from "node:url"

import { fs, path } from "zx"

const ScriptPath = path.dirname(fileURLToPath(import.meta.url))

/** Absolute path to the wire-libraries-ts repository root. */
export const RepositoryPath = path.resolve(ScriptPath, "../..")

/** Absolute path to the sdk-outpost package. */
export const PackagePath = path.join(RepositoryPath, "packages/sdk-outpost")

/** sdk-outpost package manifest used as the dependency resolution root. */
export const PackageManifestPath = path.join(PackagePath, "package.json")

/** Source-owned Ethereum artifact package consumed at SDK build time. */
export const EthereumArtifactPackageName = "@wireio/outpost-ethereum-artifacts"

/** Source-owned Solana artifact package consumed at SDK build time. */
export const SolanaArtifactPackageName = "@wireio/outpost-solana-artifacts"

/** Parse one JSON file from disk. */
export async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"))
}

/** Fail a build-time invariant with a focused message. */
export function assert(condition, message) {
  if (!condition) throw new Error(message)
}
