import ChildProcess from "node:child_process"
import Fs from "node:fs/promises"
import Path from "node:path"

import {
  PackagePath,
  deploymentAssetPath,
  readCurrentDeploymentId
} from "./deployment-utils.mjs"

const deploymentId = await readCurrentDeploymentId(),
  assetGlob = Path.join(
    deploymentAssetPath("ethereum", deploymentId),
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
