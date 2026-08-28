import {
  EthereumContractName,
  OutpostChainFamily,
  SolanaProgramName,
  type OutpostDeploymentProfile
} from "../deployments/index.js"
import { CurrentOutpostArtifactSuite } from "./Registry.js"
import {
  assertEthereumRuntimeSuiteCompatibility,
  assertOutpostArtifactSuiteCompatibility,
  assertSolanaProgramSuiteCompatibility
} from "./SuiteCompatibility.js"

/** Verify live Ethereum code against its source-owned runtime template. */
export function assertEthereumRuntimeArtifactCompatibility(
  contractName: EthereumContractName,
  code: string
): void {
  assertEthereumRuntimeSuiteCompatibility(
    contractName,
    code,
    CurrentOutpostArtifactSuite
  )
}

/** Verify live Solana executable bytes against the source-owned program binary. */
export function assertSolanaProgramArtifactCompatibility(
  programName: SolanaProgramName,
  programData: Uint8Array
): void {
  assertSolanaProgramSuiteCompatibility(
    programName,
    programData,
    CurrentOutpostArtifactSuite
  )
}

/** Verify that a deployment profile matches this SDK's source-owned interfaces. */
export function assertOutpostArtifactCompatibility(
  profile: OutpostDeploymentProfile,
  family: OutpostChainFamily
): void {
  assertOutpostArtifactSuiteCompatibility(
    profile,
    family,
    CurrentOutpostArtifactSuite
  )
}
