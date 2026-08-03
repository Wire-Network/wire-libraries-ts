import ChildProcess from "node:child_process"
import Fs from "node:fs/promises"
import Path from "node:path"

import {
  PackagePath,
  deploymentAssetPath,
  readCurrentDeploymentId,
  readDeploymentDocuments
} from "./deployment-utils.mjs"

const deploymentId = await readCurrentDeploymentId(),
  deployment = (await readDeploymentDocuments()).find(
    candidate => candidate.id === deploymentId
  )

if (deployment == null)
  throw new Error(`Unknown current deployment ${deploymentId}`)

const assetGlob = Path.join(
    deploymentAssetPath(deployment, "ethereum"),
    "*.json"
  ),
  outputPath = Path.join(PackagePath, "src/contracts/ethereum/generated"),
  typechain = Path.join(PackagePath, "node_modules/.bin/typechain")

await Fs.rm(outputPath, { force: true, recursive: true })
ChildProcess.execFileSync(
  typechain,
  [
    "--target",
    "ethers-v5",
    "--node16-modules",
    "--out-dir",
    outputPath,
    assetGlob
  ],
  { stdio: "inherit" }
)
