import * as ExtendedEthereumArtifacts from "@wireio/outpost-ethereum-artifacts-v0-4-3"
import {
  BAR__factory,
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
import {
  SolanaOutpostArtifactManifest as SolanaV042ArtifactManifest,
  liqsolCoreIdl as solanaV042LiqsolCoreIdl
} from "@wireio/outpost-solana-artifacts-v0-4-2"
import { match } from "ts-pattern"

import {
  EthereumContractName,
  OutpostChainFamily,
  SolanaProgramName,
  type OutpostDeploymentProfile
} from "../deployments/index.js"

/** Generated ethers v6 factories keyed by deployment identity. */
export interface EthereumOutpostArtifactFactories {
  readonly [EthereumContractName.WithdrawalQueue]: typeof ExtendedEthereumArtifacts.WithdrawalQueue__factory
  readonly [EthereumContractName.WithdrawalQueueV2]: typeof ExtendedEthereumArtifacts.WithdrawalQueueV2__factory
  readonly [EthereumContractName.DepositManagerV3]: typeof ExtendedEthereumArtifacts.DepositManagerV3__factory
  readonly [EthereumContractName.LiqEthTokenV4]: typeof ExtendedEthereumArtifacts.LiqEthTokenV4__factory

  readonly [EthereumContractName.BAR]: typeof BAR__factory
  readonly [EthereumContractName.DepositManager]: typeof DepositManager__factory
  readonly [EthereumContractName.LiqEthToken]: typeof LiqEthToken__factory
  readonly [EthereumContractName.SyndicationPool]: typeof SyndicationPool__factory
  readonly [EthereumContractName.OPP]: typeof OPP__factory
  readonly [EthereumContractName.OPPInbound]: typeof OPPInbound__factory
}

/** Generated Anchor IDLs keyed by deployment identity. */
export interface SolanaOutpostArtifactIdls {
  readonly [SolanaProgramName.liqsolCore]: typeof liqsolCoreIdl
}

/** Manifest shape shared by exact older and expanded producer releases. */
export interface EthereumProducerManifest {
  readonly schemaVersion: typeof EthereumOutpostArtifactManifest.schemaVersion
  readonly package: typeof EthereumOutpostArtifactManifest.package
  readonly source: typeof EthereumOutpostArtifactManifest.source
  readonly interfaces: Readonly<
    Record<string, typeof EthereumOutpostArtifactManifest.interfaces.IERC1155>
  >
  readonly contracts: Partial<
    Record<
      EthereumContractName,
      typeof ExtendedEthereumArtifacts.EthereumOutpostArtifactManifest.contracts.OPP
    >
  >
}

/** Ethereum producer bindings and manifest owned by one artifact release. */
export interface EthereumOutpostArtifactSuite {
  /** Exact producer manifest used for compatibility verification. */
  readonly manifest: EthereumProducerManifest
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
    manifest: ExtendedEthereumArtifacts.EthereumOutpostArtifactManifest,
    factories: {
      [EthereumContractName.BAR]: ExtendedEthereumArtifacts.BAR__factory,
      [EthereumContractName.DepositManager]:
        ExtendedEthereumArtifacts.DepositManager__factory,
      [EthereumContractName.LiqEthToken]:
        ExtendedEthereumArtifacts.LiqEthToken__factory,
      [EthereumContractName.SyndicationPool]:
        ExtendedEthereumArtifacts.SyndicationPool__factory,
      [EthereumContractName.OPP]: ExtendedEthereumArtifacts.OPP__factory,
      [EthereumContractName.OPPInbound]:
        ExtendedEthereumArtifacts.OPPInbound__factory,
      [EthereumContractName.WithdrawalQueue]:
        ExtendedEthereumArtifacts.WithdrawalQueue__factory,
      [EthereumContractName.WithdrawalQueueV2]:
        ExtendedEthereumArtifacts.WithdrawalQueueV2__factory,
      [EthereumContractName.DepositManagerV3]:
        ExtendedEthereumArtifacts.DepositManagerV3__factory,
      [EthereumContractName.LiqEthTokenV4]:
        ExtendedEthereumArtifacts.LiqEthTokenV4__factory
    }
  },
  solana: {
    manifest: SolanaOutpostArtifactManifest,
    idls: { [SolanaProgramName.liqsolCore]: liqsolCoreIdl }
  }
}

/** Preserve exact previously released runtimes; no ABI or runtime fallback guessing. */
const PreviousEthereumArtifactSuite: EthereumOutpostArtifactSuite = {
  manifest: EthereumOutpostArtifactManifest,
  factories: {
    ...CurrentOutpostArtifactSuite.ethereum.factories,
    [EthereumContractName.BAR]: BAR__factory,
    [EthereumContractName.DepositManager]: DepositManager__factory,
    [EthereumContractName.LiqEthToken]: LiqEthToken__factory,
    [EthereumContractName.SyndicationPool]: SyndicationPool__factory,
    [EthereumContractName.OPP]: OPP__factory,
    [EthereumContractName.OPPInbound]: OPPInbound__factory
  }
}

/** Explicit producer pairs supported by this SDK release. */
const RegisteredOutpostArtifactSuites: readonly OutpostArtifactSuite[] = [
  CurrentOutpostArtifactSuite,
  {
    ethereum: CurrentOutpostArtifactSuite.ethereum,
    solana: {
      manifest: SolanaV042ArtifactManifest,
      idls: { [SolanaProgramName.liqsolCore]: solanaV042LiqsolCoreIdl }
    }
  },
  {
    ethereum: PreviousEthereumArtifactSuite,
    solana: CurrentOutpostArtifactSuite.solana
  },
  {
    ethereum: PreviousEthereumArtifactSuite,
    solana: {
      manifest: SolanaV042ArtifactManifest,
      idls: { [SolanaProgramName.liqsolCore]: solanaV042LiqsolCoreIdl }
    }
  }
]

/** Return Ethereum interface mismatches for one artifact suite. */
function ethereumInterfaceMismatches(
  profile: OutpostDeploymentProfile,
  suite: OutpostArtifactSuite
): OutpostArtifactInterfaceMismatch[] {
  return Object.values(EthereumContractName).flatMap(contractName => {
    const deployment = profile.ethereum.contracts[contractName]
    if (deployment == null) return []
    const artifact = suite.ethereum.manifest.contracts[contractName],
      expected = artifact?.abiSha256 || "not supplied by this artifact release"
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
}
