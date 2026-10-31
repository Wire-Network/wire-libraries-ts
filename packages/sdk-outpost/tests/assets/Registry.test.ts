import { OPPInbound__factory } from "@wireio/outpost-ethereum-artifacts"
import { liqsolCoreIdl } from "@wireio/outpost-solana-artifacts"
import { EthereumOutpostArtifactManifest as EthereumV043Manifest } from "@wireio/outpost-ethereum-artifacts-v0-4-3"
import { SolanaOutpostArtifactManifest as SolanaV042Manifest } from "@wireio/outpost-solana-artifacts-v0-4-2"

import {
  CurrentOutpostArtifactSuite,
  OutpostArtifactRegistry
} from "@wireio/sdk-outpost/artifacts/Registry"
import { EthereumContractName, SolanaProgramName } from "@wireio/sdk-outpost"

import { createOutpostDeploymentProfileFixture } from "../Fixtures.js"

const MismatchedInterfaceDigest = "f".repeat(64),
  RetiredSolanaV044IdlDigest =
    "e3650e76f9eed4db25d2720a2be108fe85420d6cb366c8089044655879cf8915"

describe("OutpostArtifactRegistry", () => {
  it("resolves the exact installed Ethereum and Solana package pair", () => {
    const [suite] = OutpostArtifactRegistry.candidates(
      createOutpostDeploymentProfileFixture()
    )

    expect(suite).toBe(CurrentOutpostArtifactSuite)
    expect(suite.ethereum.factories[EthereumContractName.OPPInbound]).toBe(
      OPPInbound__factory
    )
    expect(suite.solana.idls[SolanaProgramName.liqsolCore]).toBe(liqsolCoreIdl)
  })

  it("rejects an unregistered Ethereum interface", () => {
    const profile = createOutpostDeploymentProfileFixture()
    profile.ethereum.contracts[EthereumContractName.OPPInbound].abiSha256 =
      MismatchedInterfaceDigest

    expect(OutpostArtifactRegistry.candidates(profile)).toEqual([])
  })

  it("retains the older paired deployment without mixing its interfaces with the new suite", () => {
    const profile = createOutpostDeploymentProfileFixture(
      EthereumV043Manifest,
      "@wireio/outpost-ethereum-artifacts-v0-4-3"
    )
    profile.solana.programs[SolanaProgramName.liqsolCore].idlSha256 =
      SolanaV042Manifest.programs.liqsolCore.idlSha256
    const [suite] = OutpostArtifactRegistry.candidates(profile)
    expect(suite.ethereum.manifest).toBe(EthereumV043Manifest)
    expect(suite.solana.manifest).toBe(SolanaV042Manifest)

    const mixed = createOutpostDeploymentProfileFixture()
    mixed.solana.programs[SolanaProgramName.liqsolCore].idlSha256 =
      SolanaV042Manifest.programs.liqsolCore.idlSha256
    expect(OutpostArtifactRegistry.candidates(mixed)).toEqual([])
  })

  it("refuses a legacy Ethereum interface paired with the new Solana IDL", () => {
    const mixed = createOutpostDeploymentProfileFixture(
      EthereumV043Manifest,
      "@wireio/outpost-ethereum-artifacts-v0-4-3"
    )
    expect(OutpostArtifactRegistry.candidates(mixed)).toEqual([])
  })

  it("rejects the retired intermediate Sandbox interface", () => {
    const profile = createOutpostDeploymentProfileFixture()
    profile.solana.programs[SolanaProgramName.liqsolCore].idlSha256 =
      RetiredSolanaV044IdlDigest
    expect(OutpostArtifactRegistry.candidates(profile)).toEqual([])
  })

  it("rejects an unregistered Solana interface", () => {
    const profile = createOutpostDeploymentProfileFixture()
    profile.solana.programs[SolanaProgramName.liqsolCore].idlSha256 =
      MismatchedInterfaceDigest

    expect(OutpostArtifactRegistry.candidates(profile)).toEqual([])
  })
})
