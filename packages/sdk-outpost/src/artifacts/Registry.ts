import {
  BAR__factory,
  EthereumOutpostArtifactManifest,
  OPPInbound__factory,
  OPP__factory,
  OperatorRegistry__factory,
  ReserveManager__factory
} from "@wireio/outpost-ethereum-artifacts"
import {
  SolanaOutpostArtifactManifest,
  liqsolCoreIdl
} from "@wireio/outpost-solana-artifacts"
import { match } from "ts-pattern"

import {
  EthereumContractName,
  OutpostChainFamily,
  SolanaProgramName,
  type OutpostDeploymentProfile
} from "../deployments/index.js"

/** Generated ethers v6 factories keyed by deployment identity. */
export interface EthereumOutpostArtifactFactories {
  readonly [EthereumContractName.BAR]: typeof BAR__factory
  readonly [EthereumContractName.OPP]: typeof OPP__factory
  readonly [EthereumContractName.OPPInbound]: typeof OPPInbound__factory
  readonly [EthereumContractName.OperatorRegistry]: typeof OperatorRegistry__factory
  readonly [EthereumContractName.ReserveManager]: typeof ReserveManager__factory
}

/** Generated Anchor IDLs keyed by deployment identity. */
export interface SolanaOutpostArtifactIdls {
  readonly [SolanaProgramName.liqsolCore]: typeof liqsolCoreIdl
}

/** Ethereum producer bindings and manifest owned by one artifact release. */
export interface EthereumOutpostArtifactSuite {
  /** Exact producer manifest used for compatibility verification. */
  readonly manifest: typeof EthereumOutpostArtifactManifest
  /** Generated ethers v6 factories keyed by deployment identity. */
  readonly factories: EthereumOutpostArtifactFactories
}

/** Solana producer bindings and manifest owned by one artifact release. */
export interface SolanaOutpostArtifactSuite {
  /** Exact producer manifest used for compatibility verification. */
  readonly manifest: typeof SolanaOutpostArtifactManifest
  /** Generated Anchor IDLs keyed by deployment identity. */
  readonly idls: SolanaOutpostArtifactIdls
}

/** Paired producer bindings accepted by one SDK Outpost release. */
export interface OutpostArtifactSuite {
  /** Ethereum half of the release suite. */
  readonly ethereum: EthereumOutpostArtifactSuite
  /** Solana half of the release suite. */
  readonly solana: SolanaOutpostArtifactSuite
}

/** One deployment-interface mismatch against a registered artifact suite. */
export interface OutpostArtifactInterfaceMismatch {
  /** Human-readable interface identity. */
  readonly label: string
  /** Digest recorded by the deployment profile. */
  readonly actual: string
  /** Digest published by the producer artifact package. */
  readonly expected: string
}

/** Current producer package pair compiled into this SDK branch. */
export const CurrentOutpostArtifactSuite: OutpostArtifactSuite = {
  ethereum: {
    manifest: EthereumOutpostArtifactManifest,
    factories: {
      [EthereumContractName.BAR]: BAR__factory,
      [EthereumContractName.OPP]: OPP__factory,
      [EthereumContractName.OPPInbound]: OPPInbound__factory,
      [EthereumContractName.OperatorRegistry]: OperatorRegistry__factory,
      [EthereumContractName.ReserveManager]: ReserveManager__factory
    }
  },
  solana: {
    manifest: SolanaOutpostArtifactManifest,
    idls: {
      [SolanaProgramName.liqsolCore]: liqsolCoreIdl
    }
  }
}

/** Artifact suites supported by this SDK release. */
const RegisteredOutpostArtifactSuites: readonly OutpostArtifactSuite[] = [
  CurrentOutpostArtifactSuite
]

/** Return Ethereum interface mismatches for one artifact suite. */
function ethereumInterfaceMismatches(
  profile: OutpostDeploymentProfile,
  suite: OutpostArtifactSuite
): OutpostArtifactInterfaceMismatch[] {
  return Object.values(EthereumContractName).flatMap(contractName => {
    const deployment = profile.ethereum.contracts[contractName]
    if (deployment == null) return []
    const expected = suite.ethereum.manifest.contracts[contractName].abiSha256
    return deployment.abiSha256 === expected
      ? []
      : [
          {
            label: `Ethereum ${contractName} ABI`,
            actual: deployment.abiSha256,
            expected
          }
        ]
  })
}

/** Return Solana interface mismatches for one artifact suite. */
function solanaInterfaceMismatches(
  profile: OutpostDeploymentProfile,
  suite: OutpostArtifactSuite
): OutpostArtifactInterfaceMismatch[] {
  return Object.values(SolanaProgramName).flatMap(programName => {
    const actual = profile.solana.programs[programName].idlSha256,
      expected = suite.solana.manifest.programs[programName].idlSha256
    return actual === expected
      ? []
      : [
          {
            label: `Solana ${programName} IDL`,
            actual,
            expected
          }
        ]
  })
}

/** Return all profile interface mismatches for one family and suite. */
export function outpostArtifactInterfaceMismatches(
  profile: OutpostDeploymentProfile,
  family: OutpostChainFamily,
  suite: OutpostArtifactSuite
): OutpostArtifactInterfaceMismatch[] {
  return match(family)
    .with(OutpostChainFamily.ethereum, () =>
      ethereumInterfaceMismatches(profile, suite)
    )
    .with(OutpostChainFamily.solana, () =>
      solanaInterfaceMismatches(profile, suite)
    )
    .exhaustive()
}

/** Internal registry for producer package suites compiled into this SDK. */
export namespace OutpostArtifactRegistry {
  /** Return suites whose paired generated interfaces match one profile. */
  export function candidates(
    profile: OutpostDeploymentProfile
  ): readonly OutpostArtifactSuite[] {
    return RegisteredOutpostArtifactSuites.filter(
      suite =>
        outpostArtifactInterfaceMismatches(
          profile,
          OutpostChainFamily.ethereum,
          suite
        ).length === 0 &&
        outpostArtifactInterfaceMismatches(
          profile,
          OutpostChainFamily.solana,
          suite
        ).length === 0
    )
  }

  /** Resolve paired generated bindings for a compatible deployment profile. */
  export function resolve(
    profile: OutpostDeploymentProfile
  ): OutpostArtifactSuite {
    const suite = candidates(profile)[0]
    if (suite == null) {
      throw new Error(
        `No registered artifact suite matches deployment profile ${profile.id}`
      )
    }
    return suite
  }
}
