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
import * as EthereumV045 from "@wireio/outpost-ethereum-artifacts-v0-4-5"
import * as EthereumV043 from "@wireio/outpost-ethereum-artifacts-v0-4-3"
import {
  SolanaOutpostArtifactManifest,
  liqsolCoreIdl
} from "@wireio/outpost-solana-artifacts"
import {
  SolanaOutpostArtifactManifest as SolanaV042ArtifactManifest,
  liqsolCoreIdl as solanaV042LiqsolCoreIdl
} from "@wireio/outpost-solana-artifacts-v0-4-2"
import {
  SolanaOutpostArtifactManifest as SolanaV046ArtifactManifest,
  liqsolCoreIdl as solanaV046LiqsolCoreIdl
} from "@wireio/outpost-solana-artifacts-v0-4-6"
import { match } from "ts-pattern"

import {
  EthereumContractName,
  OutpostChainFamily,
  SolanaProgramName,
  type OutpostDeploymentProfile
} from "../deployments/index.js"

type EthereumProducerBindings =
  | typeof import("@wireio/outpost-ethereum-artifacts")
  | typeof EthereumV043
  | typeof EthereumV045

/** Generated ethers factories keyed by the contract name in a verified profile. */
export type EthereumOutpostArtifactFactories = {
  readonly [Name in EthereumContractName]: EthereumProducerBindings[`${Name}__factory`]
}

/** Generated Anchor IDLs keyed by deployment identity. */
export interface SolanaOutpostArtifactIdls {
  readonly [SolanaProgramName.liqsolCore]:
    | typeof liqsolCoreIdl
    | typeof solanaV042LiqsolCoreIdl
    | typeof solanaV046LiqsolCoreIdl
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

/**
 * Temporary Testnet compatibility: remove the retained suite and package aliases
 * as soon as all supported deployments converge on the approved RC artifacts.
 * Select by verified artifact identity, never by environment labels.
 */
const RegisteredOutpostArtifactSuites: readonly OutpostArtifactSuite[] = [
  CurrentOutpostArtifactSuite,
  {
    ethereum: {
      manifest: EthereumV045.EthereumOutpostArtifactManifest,
      factories: {
        [EthereumContractName.WithdrawalQueue]:
          EthereumV045.WithdrawalQueue__factory,
        [EthereumContractName.BAR]: EthereumV045.BAR__factory,
        [EthereumContractName.DepositManager]:
          EthereumV045.DepositManager__factory,
        [EthereumContractName.LiqEthToken]: EthereumV045.LiqEthToken__factory,
        [EthereumContractName.SyndicationPool]:
          EthereumV045.SyndicationPool__factory,
        [EthereumContractName.OPP]: EthereumV045.OPP__factory,
        [EthereumContractName.OPPInbound]: EthereumV045.OPPInbound__factory
      }
    },
    solana: {
      manifest: SolanaV046ArtifactManifest,
      idls: { [SolanaProgramName.liqsolCore]: solanaV046LiqsolCoreIdl }
    }
  },
  {
    ethereum: {
      manifest: EthereumV043.EthereumOutpostArtifactManifest,
      factories: {
        [EthereumContractName.WithdrawalQueue]:
          EthereumV043.WithdrawalQueue__factory,
        [EthereumContractName.BAR]: EthereumV043.BAR__factory,
        [EthereumContractName.DepositManager]:
          EthereumV043.DepositManager__factory,
        [EthereumContractName.LiqEthToken]: EthereumV043.LiqEthToken__factory,
        [EthereumContractName.SyndicationPool]:
          EthereumV043.SyndicationPool__factory,
        [EthereumContractName.OPP]: EthereumV043.OPP__factory,
        [EthereumContractName.OPPInbound]: EthereumV043.OPPInbound__factory
      }
    },
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
}
