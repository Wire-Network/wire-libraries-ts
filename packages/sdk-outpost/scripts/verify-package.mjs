import Fs from "node:fs/promises"
import { createRequire } from "node:module"
import Path from "node:path"
import { pathToFileURL } from "node:url"

import { PackagePath, readJson } from "./deployment-utils.mjs"

const packageJson = await readJson(Path.join(PackagePath, "package.json")),
  readme = await Fs.readFile(Path.join(PackagePath, "README.md"), "utf8"),
  expectedRepository = "https://github.com/Wire-Network/wire-libraries-ts",
  expectedExports = [
    "CurrentOutpostDeployment",
    "EthereumOutpostClient",
    "OutpostClient",
    "OutpostDeployments",
    "SolanaOutpostClient",
    "assertOutpostDeployment"
  ]

assert(packageJson.name === "@wireio/sdk-outpost", "Unexpected package name")
assert(packageJson.private === false, "Package must be public")
assert(
  packageJson.publishConfig?.access === "public",
  "Package access must be public"
)
assert(
  packageJson.repository?.url === expectedRepository,
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
  JSON.stringify(packageJson.files) ===
    JSON.stringify(["lib/cjs", "lib/esm", "README.md"]),
  "Published files must stay limited to built outputs and README"
)
assert(
  !/\b(?:preview|sandbox|devnet|testnet)\b/i.test(readme),
  "Public README contains an environment-specific release label"
)

for (const path of [
  "lib/cjs/index.js",
  "lib/cjs/index.d.ts",
  "lib/cjs/package.json",
  "lib/esm/index.js",
  "lib/esm/index.d.ts",
  "lib/esm/package.json"
]) {
  await Fs.access(Path.join(PackagePath, path))
}

const publishedOutputPaths = await filesUnder(Path.join(PackagePath, "lib"))
assert(
  publishedOutputPaths.every(
    path => !/\b(?:preview|sandbox|devnet|testnet)\b/i.test(path)
  ),
  "Built output contains an environment-specific release label"
)

const require = createRequire(import.meta.url),
  cjs = require(Path.join(PackagePath, packageJson.main)),
  esm = await import(pathToFileURL(Path.join(PackagePath, packageJson.module)))

for (const name of expectedExports) {
  assert(name in cjs, `CommonJS entrypoint is missing ${name}`)
  assert(name in esm, `ES module entrypoint is missing ${name}`)
}

process.stdout.write(
  "Verified sdk-outpost CommonJS and ES module entrypoints\n"
)

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function filesUnder(path) {
  const entries = await Fs.readdir(path, { withFileTypes: true }),
    paths = await Promise.all(
      entries.map(entry => {
        const child = Path.join(path, entry.name)
        return entry.isDirectory() ? filesUnder(child) : [child]
      })
    )

  return paths.flat()
}
