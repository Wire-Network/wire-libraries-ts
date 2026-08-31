import type { Program } from "@coral-xyz/anchor"
import {
  BAR__factory,
  IERC1155__factory,
  OPP__factory,
  OperatorRegistry__factory,
  ReserveManager__factory
} from "@wireio/outpost-ethereum-artifacts"
import {
  liqsolCoreIdl,
  type LiqsolCore
} from "@wireio/outpost-solana-artifacts"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"

import {
  EthereumContractName,
  OutpostArtifactManifests,
  OutpostChainFamily,
  SolanaProgramName,
  assertOutpostArtifactCompatibility
} from "@wireio/sdk-outpost"

import { createOutpostDeploymentProfileFixture } from "../Fixtures.js"

const PackageRequire = createRequire(__filename)

/** Return the SHA-256 digest for one installed producer-package file. */
function installedPackageFileSha256(
  packageName: string,
  packagePath: string
): string {
  return createHash("sha256")
    .update(
      readFileSync(PackageRequire.resolve(`${packageName}/${packagePath}`))
    )
    .digest("hex")
}

describe("source-owned outpost artifacts", () => {
  it("records exact producer package identity", () => {
    expect(OutpostArtifactManifests.ethereum.package.name).toBe(
      "@wireio/outpost-ethereum-artifacts"
    )
    expect(OutpostArtifactManifests.solana.package.name).toBe(
      "@wireio/outpost-solana-artifacts"
    )
    expect(OutpostArtifactManifests.ethereum.package.version).toBe("0.3.0")
    expect(OutpostArtifactManifests.solana.package.version).toBe("0.3.1")
    expect(OutpostArtifactManifests.ethereum.source.revision).toBe(
      "b90035b48414267d1b3ca183b88e2118a8c5b16e"
    )
    expect(OutpostArtifactManifests.solana.source.revision).toBe(
      "9d49cbe92419606667f6a4684714aa742ac5c40b"
    )
  })

  it("ships checksum-valid Ethereum runtimes and Solana program inputs", () => {
    Object.values(OutpostArtifactManifests.ethereum.contracts).forEach(
      artifact => {
        expect(
          installedPackageFileSha256(
            OutpostArtifactManifests.ethereum.package.name,
            artifact.runtimeBytecodePath
          )
        ).toBe(artifact.runtimeBytecodeSha256)
      }
    )

    const solanaProgram =
      OutpostArtifactManifests.solana.programs[SolanaProgramName.liqsolCore]
    expect(
      installedPackageFileSha256(
        OutpostArtifactManifests.solana.package.name,
        solanaProgram.idlPath
      )
    ).toBe(solanaProgram.idlSha256)
    expect(
      installedPackageFileSha256(
        OutpostArtifactManifests.solana.package.name,
        solanaProgram.programBinaryPath
      )
    ).toBe(solanaProgram.programBinarySha256)
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
      BAR__factory.createInterface().getFunction("wireNodesContract")
    ).toBeDefined()
    expect(
      BAR__factory.createInterface().getFunction("commitNode")
    ).toBeDefined()
    expect(
      IERC1155__factory.createInterface().getFunction("balanceOf")
    ).toBeDefined()
    expect(
      IERC1155__factory.createInterface().getFunction("setApprovalForAll")
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
