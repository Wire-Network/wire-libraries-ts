import {
  BAR__factory,
  WithdrawalQueue__factory,
  DepositManager__factory,
  LiqEthToken__factory,
  SyndicationPool__factory,
  EthereumOutpostArtifactManifest,
  OPPInbound__factory,
  OPP__factory
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

type EthereumProducerBindings =
  typeof import("@wireio/outpost-ethereum-artifacts")

/** Generated ethers factories keyed by the contract name in a verified profile. */
export type EthereumOutpostArtifactFactories = {
  readonly [Name in EthereumContractName]: EthereumProducerBindings[`${Name}__factory`]
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

/** One deployment-interface mismatch against the current producer suite. */
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
      [EthereumContractName.WithdrawalQueue]: WithdrawalQueue__factory,
      [EthereumContractName.BAR]: BAR__factory,
      [EthereumContractName.DepositManager]: DepositManager__factory,
      [EthereumContractName.LiqEthToken]: LiqEthToken__factory,
      [EthereumContractName.SyndicationPool]: SyndicationPool__factory,
      [EthereumContractName.OPP]: OPP__factory,
      [EthereumContractName.OPPInbound]: OPPInbound__factory
    }
  },
  solana: {
    manifest: SolanaOutpostArtifactManifest,
    idls: {
      [SolanaProgramName.liqsolCore]: liqsolCoreIdl
    }
  }
}

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
