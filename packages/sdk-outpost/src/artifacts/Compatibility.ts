import { match } from "ts-pattern"
import { utils as ethersUtils } from "ethers"

import {
  EthereumContractName,
  OutpostChainFamily,
  OutpostDeploymentProfile,
  SolanaProgramName
} from "../deployments/index.js"
import { OutpostArtifactManifests } from "./generated/index.js"
import { OutpostArtifactMode } from "./Mode.js"

const SolanaProgramDataMetadataByteLength = 45

/** Byte range occupied by one linked Ethereum library address. */
interface EthereumRuntimeLinkReference {
  readonly start: number
  readonly length: number
}

/** Return the SHA-256 digest for chain runtime bytes. */
function sha256(value: Uint8Array): string {
  return ethersUtils.sha256(value).slice(2)
}

/** Zero environment-specific linked-library addresses in live runtime code. */
function normalizeEthereumRuntimeCode(
  code: string,
  linkReferences: readonly EthereumRuntimeLinkReference[]
): Uint8Array {
  const runtimeCode = Uint8Array.from(ethersUtils.arrayify(code))
  let previousReferenceEnd = 0

  linkReferences.forEach(({ start, length }) => {
    const referenceEnd = start + length
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(length) ||
      length <= 0 ||
      start < previousReferenceEnd ||
      referenceEnd > runtimeCode.length
    ) {
      throw new Error("Ethereum artifact has invalid runtime link references")
    }
    runtimeCode.fill(0, start, referenceEnd)
    previousReferenceEnd = referenceEnd
  })

  return runtimeCode
}

/** Verify live Ethereum code against its source-owned runtime template. */
export function assertEthereumRuntimeArtifactCompatibility(
  contractName: EthereumContractName,
  code: string
): void {
  const artifact = OutpostArtifactManifests.ethereum.contracts[contractName]

  match(OutpostArtifactManifests.mode)
    .with(OutpostArtifactMode.sourcePackage, () => {
      const normalizedCode = normalizeEthereumRuntimeCode(
        code,
        artifact.runtimeLinkReferences
      )

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
    })
    .with(OutpostArtifactMode.deploymentBundle, () => {
      const digest = sha256(ethersUtils.arrayify(code))
      if (digest !== artifact.implementationCodeSha256) {
        throw new Error(
          `Ethereum ${contractName} deployment runtime mismatch: expected ${artifact.implementationCodeSha256}, received ${digest}`
        )
      }
    })
    .exhaustive()
}

/** Verify live Solana executable bytes against the source-owned program binary. */
export function assertSolanaProgramArtifactCompatibility(
  programName: SolanaProgramName,
  programData: Uint8Array
): void {
  const artifact = OutpostArtifactManifests.solana.programs[programName]

  match(OutpostArtifactManifests.mode)
    .with(OutpostArtifactMode.sourcePackage, () => {
      const programBinaryEnd =
        SolanaProgramDataMetadataByteLength + artifact.programBinaryLength

      if (programData.length < programBinaryEnd) {
        throw new Error(
          `Solana ${programName} artifact program is truncated: expected ${artifact.programBinaryLength} executable bytes`
        )
      }
      const digest = sha256(
        programData.subarray(
          SolanaProgramDataMetadataByteLength,
          programBinaryEnd
        )
      )
      if (digest !== artifact.programBinarySha256) {
        throw new Error(
          `Solana ${programName} artifact program mismatch: expected ${artifact.programBinarySha256}, received ${digest}`
        )
      }
    })
    .with(OutpostArtifactMode.deploymentBundle, () => {
      const digest = sha256(programData)
      if (digest !== artifact.programDataSha256) {
        throw new Error(
          `Solana ${programName} deployment ProgramData mismatch: expected ${artifact.programDataSha256}, received ${digest}`
        )
      }
    })
    .exhaustive()
}

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
    .with(OutpostChainFamily.ethereum, () => {
      Object.values(EthereumContractName).forEach(contractName => {
        assertInterfaceDigest(
          profile.ethereum.contracts[contractName].abiSha256,
          OutpostArtifactManifests.ethereum.contracts[contractName].abiSha256,
          `Ethereum ${contractName} ABI`
        )
        if (
          OutpostArtifactManifests.mode === OutpostArtifactMode.deploymentBundle
        ) {
          assertInterfaceDigest(
            profile.ethereum.contracts[contractName].implementationCodeSha256,
            OutpostArtifactManifests.ethereum.contracts[contractName]
              .implementationCodeSha256,
            `Ethereum ${contractName} deployment runtime`
          )
        }
      })
    })
    .with(OutpostChainFamily.solana, () => {
      Object.values(SolanaProgramName).forEach(programName => {
        assertInterfaceDigest(
          profile.solana.programs[programName].idlSha256,
          OutpostArtifactManifests.solana.programs[programName].idlSha256,
          `Solana ${programName} IDL`
        )
        if (
          OutpostArtifactManifests.mode === OutpostArtifactMode.deploymentBundle
        ) {
          assertInterfaceDigest(
            profile.solana.programs[programName].programDataSha256,
            OutpostArtifactManifests.solana.programs[programName]
              .programDataSha256,
            `Solana ${programName} deployment ProgramData`
          )
        }
      })
    })
    .exhaustive()
}
