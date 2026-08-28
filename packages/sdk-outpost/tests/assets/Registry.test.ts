import { ReserveManager__factory } from "@wireio/outpost-ethereum-artifacts"
import { liqsolCoreIdl } from "@wireio/outpost-solana-artifacts"

import {
  CurrentOutpostArtifactSuite,
  OutpostArtifactRegistry
} from "@wireio/sdk-outpost/artifacts/Registry"
import { EthereumContractName, SolanaProgramName } from "@wireio/sdk-outpost"

import { createOutpostDeploymentProfileFixture } from "../Fixtures.js"

const MismatchedInterfaceDigest = "f".repeat(64)

describe("OutpostArtifactRegistry", () => {
  it("resolves the exact installed Ethereum and Solana package pair", () => {
    const suite = OutpostArtifactRegistry.resolve(
      createOutpostDeploymentProfileFixture()
    )

    expect(suite).toBe(CurrentOutpostArtifactSuite)
    expect(suite.ethereum.factories[EthereumContractName.ReserveManager]).toBe(
      ReserveManager__factory
    )
    expect(suite.solana.idls[SolanaProgramName.liqsolCore]).toBe(liqsolCoreIdl)
  })

  it("rejects an unregistered Ethereum interface", () => {
    const profile = createOutpostDeploymentProfileFixture()
    profile.ethereum.contracts[EthereumContractName.ReserveManager].abiSha256 =
      MismatchedInterfaceDigest

    expect(OutpostArtifactRegistry.candidates(profile)).toEqual([])
    expect(() => OutpostArtifactRegistry.resolve(profile)).toThrow(
      "No registered artifact suite matches deployment profile"
    )
  })

  it("rejects an unregistered Solana interface", () => {
    const profile = createOutpostDeploymentProfileFixture()
    profile.solana.programs[SolanaProgramName.liqsolCore].idlSha256 =
      MismatchedInterfaceDigest

    expect(OutpostArtifactRegistry.candidates(profile)).toEqual([])
    expect(() => OutpostArtifactRegistry.resolve(profile)).toThrow(
      "No registered artifact suite matches deployment profile"
    )
  })
})
