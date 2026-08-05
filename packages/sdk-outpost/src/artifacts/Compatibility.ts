import { match } from "ts-pattern"

import {
  EthereumContractName,
  OutpostChainFamily,
  OutpostDeploymentProfile,
  SolanaProgramName
} from "../deployments/index.js"
import { OutpostArtifactManifests } from "./generated/index.js"

/** Assert that one profile digest matches the interface compiled into the SDK. */
function assertInterfaceDigest(
  actual: string,
  expected: string,
  label: string
): void {
  if (actual !== expected) {
    throw new Error(
      `${label} interface mismatch: expected ${expected}, received ${actual}`
    )
  }
}

/** Verify that a deployment profile matches this SDK's source-owned interfaces. */
export function assertOutpostArtifactCompatibility(
  profile: OutpostDeploymentProfile,
  family: OutpostChainFamily
): void {
  match(family)
    .with(OutpostChainFamily.ethereum, () =>
      Object.values(EthereumContractName).forEach(contractName =>
        assertInterfaceDigest(
          profile.ethereum.contracts[contractName].abiSha256,
          OutpostArtifactManifests.ethereum.contracts[contractName].abiSha256,
          `Ethereum ${contractName} ABI`
        )
      )
    )
    .with(OutpostChainFamily.solana, () =>
      Object.values(SolanaProgramName).forEach(programName =>
        assertInterfaceDigest(
          profile.solana.programs[programName].idlSha256,
          OutpostArtifactManifests.solana.programs[programName].idlSha256,
          `Solana ${programName} IDL`
        )
      )
    )
    .exhaustive()
}
