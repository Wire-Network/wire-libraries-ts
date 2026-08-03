import ChildProcess from "node:child_process"
import Fs from "node:fs/promises"
import Path from "node:path"

import { PackagePath, sha256 } from "./deployment-utils.mjs"

const GeneratedPaths = [
    "src/contracts/ethereum/generated",
    "src/deployments/generated/Catalog.ts",
    "src/programs/solana/generated/LiqsolCore.ts"
  ],
  before = await snapshot()

for (const script of [
  "generate-deployment-catalog.mjs",
  "generate-ethereum-types.mjs",
  "generate-solana-types.mjs"
]) {
  ChildProcess.execFileSync(
    process.execPath,
    [Path.join(PackagePath, "scripts", script)],
    { stdio: "inherit" }
  )
}

const after = await snapshot()
if (JSON.stringify(before) !== JSON.stringify(after)) {
  throw new Error(
    "Generated sdk-outpost sources were stale and have been refreshed; review and commit them"
  )
}

process.stdout.write(`Verified ${after.length} generated sdk-outpost files\n`)

async function snapshot() {
  const files = (
      await Promise.all(
        GeneratedPaths.map(path => filesUnder(Path.join(PackagePath, path)))
      )
    )
      .flat()
      .sort(),
    entries = await Promise.all(
      files.map(async path => [
        Path.relative(PackagePath, path),
        await sha256(path)
      ])
    )

  return entries
}

async function filesUnder(path) {
  const stat = await Fs.stat(path)
  if (stat.isFile()) return [path]

  const entries = await Fs.readdir(path, { withFileTypes: true }),
    children = await Promise.all(
      entries.map(entry => filesUnder(Path.join(path, entry.name)))
    )

  return children.flat()
}
