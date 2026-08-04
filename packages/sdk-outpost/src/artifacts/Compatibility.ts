import { match } from "ts-pattern"

import {
  EthereumContractName,
  OutpostChainFamily,
  OutpostDeployment,
  SolanaProgramName
} from "../deployments/index.js"
import { OutpostArtifactManifests } from "./generated/index.js"

/** Assert that one deployment digest matches the interface compiled into the SDK. */
function assertArtifactDigest(
  actual: string,
  expected: string,
  label: string
): void {
  if (actual !== expected) {
    throw new Error(
      `${label} artifact mismatch: expected ${expected}, received ${actual}`
    )
  }
}

/** Verify that a runtime deployment matches this SDK's source-owned artifacts. */
export function assertOutpostArtifactCompatibility(
  deployment: OutpostDeployment,
  family: OutpostChainFamily
): void {
  match(family)
    .with(OutpostChainFamily.ethereum, () =>
      Object.values(EthereumContractName).forEach(contractName =>
        assertArtifactDigest(
          deployment.ethereum.contracts[contractName].artifactSha256,
          OutpostArtifactManifests.ethereum.contracts[contractName]
            .artifactSha256,
          `Ethereum ${contractName}`
        )
      )
    )
    .with(OutpostChainFamily.solana, () =>
      Object.values(SolanaProgramName).forEach(programName =>
        assertArtifactDigest(
          deployment.solana.programs[programName].artifactSha256,
          OutpostArtifactManifests.solana.programs[programName].idlSha256,
          `Solana ${programName}`
        )
      )
    )
    .exhaustive()
}
