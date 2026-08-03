import Path from "node:path"

import {
  deploymentAssetPath,
  readCurrentDeploymentId,
  readDeploymentDocuments,
  readJson,
  sha256
} from "./deployment-utils.mjs"

const ContractNames = [
    "OPP",
    "OPPInbound",
    "OperatorRegistry",
    "ReserveManager"
  ],
  documents = await readDeploymentDocuments(),
  currentId = await readCurrentDeploymentId(),
  current = documents.find(document => document.id === currentId)

if (current == null) throw new Error(`Unknown current deployment ${currentId}`)

for (const deployment of documents) {
  for (const contractName of ContractNames) {
    const path = Path.join(
        deploymentAssetPath(deployment, "ethereum"),
        `${contractName}.json`
      ),
      actualHash = await sha256(path),
      expectedHash = deployment.ethereum.contracts[contractName].artifactSha256
    if (actualHash !== expectedHash) {
      throw new Error(`${deployment.id} ${contractName} ABI digest mismatch`)
    }
  }

  const solanaPath = Path.join(
      deploymentAssetPath(deployment, "solana"),
      "liqsol_core.json"
    ),
    solanaHash = await sha256(solanaPath)
  if (solanaHash !== deployment.solana.programs.liqsolCore.artifactSha256) {
    throw new Error(`${deployment.id} liqsol_core IDL digest mismatch`)
  }
}

for (const deployment of documents) {
  if (deployment.id === current.id) continue
  for (const contractName of ContractNames) {
    const previous = await readJson(
        Path.join(
          deploymentAssetPath(deployment, "ethereum"),
          `${contractName}.json`
        )
      ),
      currentArtifact = await readJson(
        Path.join(
          deploymentAssetPath(current, "ethereum"),
          `${contractName}.json`
        )
      )
    assertSurfaceCovered(
      `${deployment.id} ${contractName}`,
      callableSurface(previous.abi),
      callableSurface(currentArtifact.abi)
    )
  }
}

process.stdout.write(
  `Verified ${documents.length} outpost deployments; current=${current.id}\n`
)

function callableSurface(abi) {
  return new Set(
    abi
      .filter(entry => entry.type === "function" || entry.type === "event")
      .map(
        entry =>
          `${entry.type}:${entry.name}(${(entry.inputs ?? []).map(input => input.type).join(",")})`
      )
  )
}

function assertSurfaceCovered(label, previous, currentSurface) {
  const missing = [...previous].filter(
    signature => !currentSurface.has(signature)
  )
  if (missing.length > 0) {
    throw new Error(
      `${label} is not covered by the current generated types: ${missing.join(", ")}`
    )
  }
}
