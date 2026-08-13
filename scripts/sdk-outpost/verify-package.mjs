#!/usr/bin/env zx

import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"

import { fs, path } from "zx"

import { PackagePath, assert, readJson } from "./config.mjs"

const packageJson = await readJson(path.join(PackagePath, "package.json")),
  readme = await fs.readFile(path.join(PackagePath, "README.md"), "utf8"),
  ExpectedRepository = "https://github.com/Wire-Network/wire-libraries-ts",
  ExpectedPublishedFiles = ["lib/cjs", "lib/esm", "README.md"],
  ExpectedExports = [
    "EthereumOutpostClient",
    "EthereumReserveClient",
    "OutpostArtifactManifests",
    "OutpostClient",
    "OutpostDeploymentVerifier",
    "SolanaOutpostClient",
    "SolanaReserveClient",
    "assertOutpostArtifactCompatibility",
    "parseOutpostDeploymentProfile"
  ]

assert(packageJson.name === "@wireio/sdk-outpost", "Unexpected package name")
assert(packageJson.private === false, "Package must be public")
assert(
  packageJson.publishConfig?.access === "public",
  "Package access must be public"
)
assert(
  packageJson.repository?.url === ExpectedRepository,
  "Repository URL must match provenance source"
)
assert(
  packageJson.repository?.directory === "packages/sdk-outpost",
  "Repository directory is incorrect"
)
assert(
  packageJson.license === "FSL-1.1-Apache-2.0",
  "Package license is missing"
)
assert(
  JSON.stringify(packageJson.files) === JSON.stringify(ExpectedPublishedFiles),
  "Published files must stay limited to built outputs and README"
)
assert(
  !/\b(?:preview|sandbox|devnet|testnet)\b/i.test(readme),
  "Public README contains an environment-specific release label"
)

await Promise.all(
  [
    "lib/cjs/index.js",
    "lib/cjs/index.d.ts",
    "lib/cjs/package.json",
    "lib/esm/index.js",
    "lib/esm/index.d.ts",
    "lib/esm/package.json"
  ].map(outputPath => fs.access(path.join(PackagePath, outputPath)))
)

/** Return every file beneath a package output directory. */
async function filesUnder(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }),
    paths = await Promise.all(
      entries.map(entry => {
        const child = path.join(directory, entry.name)
        return entry.isDirectory() ? filesUnder(child) : [child]
      })
    )

  return paths.flat()
}

const publishedOutputPaths = await filesUnder(path.join(PackagePath, "lib"))
assert(
  publishedOutputPaths.every(
    outputPath => !/\b(?:preview|sandbox|devnet|testnet)\b/i.test(outputPath)
  ),
  "Built output contains an environment-specific release label"
)

const require = createRequire(import.meta.url),
  cjs = require(path.join(PackagePath, packageJson.main)),
  esm = await import(pathToFileURL(path.join(PackagePath, packageJson.module)))

ExpectedExports.forEach(name => {
  assert(name in cjs, `CommonJS entrypoint is missing ${name}`)
  assert(name in esm, `ES module entrypoint is missing ${name}`)
})
assert(
  cjs.OutpostArtifactManifests.mode === cjs.OutpostArtifactMode.sourcePackage &&
    esm.OutpostArtifactManifests.mode === esm.OutpostArtifactMode.sourcePackage,
  "Publishable sdk-outpost output must use canonical source-package artifacts"
)

process.stdout.write(
  "Verified sdk-outpost package boundaries and entrypoints\n"
)
