import type { Program } from "@coral-xyz/anchor"
import { utils as ethersUtils } from "ethers"

import {
  EthereumContractName,
  OPP__factory,
  OperatorRegistry__factory,
  OutpostArtifactMode,
  OutpostArtifactManifests,
  OutpostChainFamily,
  ReserveManager__factory,
  SolanaProgramName,
  type LiqsolCore,
  assertEthereumRuntimeArtifactCompatibility,
  assertOutpostArtifactCompatibility,
  assertSolanaProgramArtifactCompatibility,
  liqsolCoreIdl
} from "@wireio/sdk-outpost"

import { createOutpostDeploymentProfileFixture } from "../Fixtures.js"

describe("source-owned outpost artifacts", () => {
  afterEach(() => jest.restoreAllMocks())

  it("records exact producer package identity", () => {
    expect(OutpostArtifactManifests.mode).toBe(
      OutpostArtifactMode.sourcePackage
    )
    expect(OutpostArtifactManifests.deploymentProfileId).toBe("")
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
        assertOutpostArtifactCompatibility(
          createOutpostDeploymentProfileFixture(),
          family
        )
      ).not.toThrow()
    }
  )

  it("rejects a runtime deployment with an incompatible Ethereum ABI", () => {
    const profile = createOutpostDeploymentProfileFixture()
    profile.ethereum.contracts[EthereumContractName.ReserveManager].abiSha256 =
      "f".repeat(64)

    expect(() =>
      assertOutpostArtifactCompatibility(profile, OutpostChainFamily.ethereum)
    ).toThrow("Ethereum ReserveManager ABI interface mismatch")
  })

  it("rejects a runtime deployment with an incompatible Solana IDL", () => {
    const profile = createOutpostDeploymentProfileFixture()
    profile.solana.programs[SolanaProgramName.liqsolCore].idlSha256 =
      "f".repeat(64)

    expect(() =>
      assertOutpostArtifactCompatibility(profile, OutpostChainFamily.solana)
    ).toThrow("Solana liqsolCore IDL interface mismatch")
  })

  it("binds deployment-bundle compatibility to exact deployment hashes", () => {
    const profile = createOutpostDeploymentProfileFixture()
    jest.replaceProperty(
      OutpostArtifactManifests,
      "mode",
      OutpostArtifactMode.deploymentBundle
    )
    Object.values(EthereumContractName).forEach(contractName =>
      jest.replaceProperty(
        OutpostArtifactManifests.ethereum.contracts[contractName],
        "implementationCodeSha256",
        profile.ethereum.contracts[contractName].implementationCodeSha256
      )
    )
    jest.replaceProperty(
      OutpostArtifactManifests.solana.programs[SolanaProgramName.liqsolCore],
      "programDataSha256",
      profile.solana.programs[SolanaProgramName.liqsolCore].programDataSha256
    )

    expect(() =>
      assertOutpostArtifactCompatibility(profile, OutpostChainFamily.ethereum)
    ).not.toThrow()
    expect(() =>
      assertOutpostArtifactCompatibility(profile, OutpostChainFamily.solana)
    ).not.toThrow()

    profile.ethereum.contracts[
      EthereumContractName.ReserveManager
    ].implementationCodeSha256 = "f".repeat(64)
    expect(() =>
      assertOutpostArtifactCompatibility(profile, OutpostChainFamily.ethereum)
    ).toThrow("Ethereum ReserveManager deployment runtime interface mismatch")
  })

  it("verifies exact deployment-bundle executable hashes", () => {
    const ethereumCode = "0x1234",
      solanaProgramData = Uint8Array.from([1, 2, 3])
    jest.replaceProperty(
      OutpostArtifactManifests,
      "mode",
      OutpostArtifactMode.deploymentBundle
    )
    jest.replaceProperty(
      OutpostArtifactManifests.ethereum.contracts[
        EthereumContractName.ReserveManager
      ],
      "implementationCodeSha256",
      ethersUtils.sha256(ethereumCode).slice(2)
    )
    jest.replaceProperty(
      OutpostArtifactManifests.solana.programs[SolanaProgramName.liqsolCore],
      "programDataSha256",
      ethersUtils.sha256(solanaProgramData).slice(2)
    )

    expect(() =>
      assertEthereumRuntimeArtifactCompatibility(
        EthereumContractName.ReserveManager,
        ethereumCode
      )
    ).not.toThrow()
    expect(() =>
      assertSolanaProgramArtifactCompatibility(
        SolanaProgramName.liqsolCore,
        solanaProgramData
      )
    ).not.toThrow()
    expect(() =>
      assertEthereumRuntimeArtifactCompatibility(
        EthereumContractName.ReserveManager,
        "0x5678"
      )
    ).toThrow("Ethereum ReserveManager deployment runtime mismatch")
  })

  it("generates the callable swap and collateral surfaces", () => {
    const accountNames: Array<keyof Program<LiqsolCore>["account"]> = [
      "outpostConfig",
      "reserve"
    ]
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
    expect(accountNames).toEqual(["outpostConfig", "reserve"])
  })
})
