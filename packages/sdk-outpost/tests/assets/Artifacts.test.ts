import {
  EthereumContractName,
  OPP__factory,
  OperatorRegistry__factory,
  OutpostArtifactManifests,
  OutpostChainFamily,
  ReserveManager__factory,
  SolanaProgramName,
  assertOutpostArtifactCompatibility,
  liqsolCoreIdl
} from "@wireio/sdk-outpost"

import { createDeploymentFixture } from "../Fixtures.js"

describe("source-owned outpost artifacts", () => {
  it("records exact producer package identity", () => {
    expect(OutpostArtifactManifests.ethereum.package.name).toBe(
      "@wireio/outpost-ethereum-artifacts"
    )
    expect(OutpostArtifactManifests.solana.package.name).toBe(
      "@wireio/outpost-solana-artifacts"
    )
  })

  it.each(Object.values(OutpostChainFamily))(
    "accepts a runtime deployment aligned with %s artifacts",
    family => {
      expect(() =>
        assertOutpostArtifactCompatibility(createDeploymentFixture(), family)
      ).not.toThrow()
    }
  )

  it("rejects a runtime deployment with an incompatible Ethereum ABI", () => {
    const deployment = createDeploymentFixture()
    deployment.ethereum.contracts[
      EthereumContractName.ReserveManager
    ].artifactSha256 = "f".repeat(64)

    expect(() =>
      assertOutpostArtifactCompatibility(
        deployment,
        OutpostChainFamily.ethereum
      )
    ).toThrow("Ethereum ReserveManager artifact mismatch")
  })

  it("rejects a runtime deployment with an incompatible Solana IDL", () => {
    const deployment = createDeploymentFixture()
    deployment.solana.programs[SolanaProgramName.liqsolCore].artifactSha256 =
      "f".repeat(64)

    expect(() =>
      assertOutpostArtifactCompatibility(deployment, OutpostChainFamily.solana)
    ).toThrow("Solana liqsolCore artifact mismatch")
  })

  it("generates the callable swap and collateral surfaces", () => {
    expect(OPP__factory.abi.length).toBeGreaterThan(0)
    expect(
      OPP__factory.createInterface().getFunction("addAttestation")
    ).toBeDefined()
    expect(
      ReserveManager__factory.createInterface().getFunction("requestSwap")
    ).toBeDefined()
    expect(
      ReserveManager__factory.createInterface().getFunction(
        "requestSwapErc20WithApproval"
      )
    ).toBeDefined()
    expect(
      OperatorRegistry__factory.createInterface().getFunction("deposit")
    ).toBeDefined()
    expect(
      OperatorRegistry__factory.createInterface().getFunction("commit")
    ).toBeDefined()
    expect(
      liqsolCoreIdl.instructions.map(instruction => instruction.name)
    ).toEqual(
      expect.arrayContaining([
        "requestSwap",
        "requestSwapSpl",
        "commitUnderwrite"
      ])
    )
  })
})
