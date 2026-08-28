import { getBytes, sha256 as ethersSha256 } from "ethers"

import {
  EthereumContractName,
  OutpostChainFamily,
  SolanaProgramName,
  type OutpostDeploymentProfile
} from "../deployments/index.js"
import {
  outpostArtifactInterfaceMismatches,
  type OutpostArtifactSuite
} from "./Registry.js"

const SolanaProgramDataMetadataByteLength = 45

/** Deployment-specific byte range in one Ethereum runtime template. */
interface EthereumRuntimeReference {
  readonly start: number
  readonly length: number
}

/** Return the SHA-256 digest for chain runtime bytes. */
function sha256(value: Uint8Array): string {
  return ethersSha256(value).slice(2)
}

/** Zero environment-specific ranges in live Ethereum runtime code. */
function normalizeEthereumRuntimeCode(
  code: string,
  runtimeReferences: readonly EthereumRuntimeReference[]
): Uint8Array {
  const runtimeCode = Uint8Array.from(getBytes(code))
  let previousReferenceEnd = 0

  runtimeReferences.forEach(({ start, length }) => {
    const referenceEnd = start + length
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(length) ||
      length <= 0 ||
      start < previousReferenceEnd ||
      referenceEnd > runtimeCode.length
    ) {
      throw new Error("Ethereum artifact has invalid runtime references")
    }
    runtimeCode.fill(0, start, referenceEnd)
    previousReferenceEnd = referenceEnd
  })

  return runtimeCode
}

/** Verify live Ethereum code against one producer runtime template. */
export function assertEthereumRuntimeSuiteCompatibility(
  contractName: EthereumContractName,
  code: string,
  suite: OutpostArtifactSuite
): void {
  const artifact = suite.ethereum.manifest.contracts[contractName],
    runtimeReferences = [
      ...artifact.runtimeLinkReferences,
      ...artifact.runtimeImmutableReferences
    ].sort((left, right) => left.start - right.start),
    normalizedCode = normalizeEthereumRuntimeCode(code, runtimeReferences)

  if (normalizedCode.length !== artifact.runtimeBytecodeLength) {
    throw new Error(
      `Ethereum ${contractName} artifact runtime length mismatch: expected ${artifact.runtimeBytecodeLength}, received ${normalizedCode.length}`
    )
  }
  const digest = sha256(normalizedCode)
  if (digest !== artifact.runtimeBytecodeSha256) {
    throw new Error(
      `Ethereum ${contractName} artifact runtime mismatch: expected ${artifact.runtimeBytecodeSha256}, received ${digest}`
    )
  }
}

/** Verify live Solana executable bytes against one producer program binary. */
export function assertSolanaProgramSuiteCompatibility(
  programName: SolanaProgramName,
  programData: Uint8Array,
  suite: OutpostArtifactSuite
): void {
  const artifact = suite.solana.manifest.programs[programName],
    programBinaryEnd =
      SolanaProgramDataMetadataByteLength + artifact.programBinaryLength

  if (programData.length < programBinaryEnd) {
    throw new Error(
      `Solana ${programName} artifact program is truncated: expected ${artifact.programBinaryLength} executable bytes`
    )
  }
  const digest = sha256(
    programData.subarray(SolanaProgramDataMetadataByteLength, programBinaryEnd)
  )
  if (digest !== artifact.programBinarySha256) {
    throw new Error(
      `Solana ${programName} artifact program mismatch: expected ${artifact.programBinarySha256}, received ${digest}`
    )
  }
}

/** Verify profile interfaces against one producer artifact suite. */
export function assertOutpostArtifactSuiteCompatibility(
  profile: OutpostDeploymentProfile,
  family: OutpostChainFamily,
  suite: OutpostArtifactSuite
): void {
  const mismatch = outpostArtifactInterfaceMismatches(profile, family, suite)[0]
  if (mismatch != null) {
    throw new Error(
      `${mismatch.label} interface mismatch: expected ${mismatch.expected}, received ${mismatch.actual}`
    )
  }
}
