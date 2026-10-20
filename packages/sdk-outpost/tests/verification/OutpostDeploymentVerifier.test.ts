import {
  OutpostChainFamily,
  OutpostDeploymentVerifier,
  SolanaProgramName,
  SolanaUpgradeableLoaderProgramId
} from "@wireio/sdk-outpost"
import { SolanaOutpostArtifactManifest as SolanaV042Manifest } from "@wireio/outpost-solana-artifacts-v0-4-2"
import { sha256 } from "ethers"
import {
  CurrentOutpostArtifactSuite,
  OutpostArtifactRegistry
} from "@wireio/sdk-outpost/artifacts/Registry"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import {
  createEthereumProviderFixture,
  createOutpostDeploymentProfileFixture,
  createSolanaProgramDataAccountData,
  createSolanaProviderFixture
} from "../Fixtures.js"

const PackageRequire = createRequire(__filename),
  SolanaV042Package = "@wireio/outpost-solana-artifacts-v0-4-2",
  SolanaV042Artifact = SolanaV042Manifest.programs.liqsolCore,
  SolanaV042Binary = readFileSync(
    PackageRequire.resolve(
      `${SolanaV042Package}/${SolanaV042Artifact.programBinaryPath}`
    )
  )

describe("OutpostDeploymentVerifier", () => {
  it("verifies an Ethereum deployment through the generic facade", async () => {
    const profile = createOutpostDeploymentProfileFixture()

    await expect(
      OutpostDeploymentVerifier.verify({
        family: OutpostChainFamily.ethereum,
        profile,
        provider: createEthereumProviderFixture(profile)
      })
    ).resolves.toBe(CurrentOutpostArtifactSuite)
  })

  it("verifies a Solana deployment through the generic facade", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createSolanaProviderFixture(profile)

    await expect(
      OutpostDeploymentVerifier.verify({
        family: OutpostChainFamily.solana,
        profile,
        connection: provider.connection
      })
    ).resolves.toBe(CurrentOutpostArtifactSuite)
  })

  it("returns the verified candidate when matching interfaces have different binaries", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      rejected = {
        ...CurrentOutpostArtifactSuite,
        solana: {
          ...CurrentOutpostArtifactSuite.solana,
          manifest: {
            ...CurrentOutpostArtifactSuite.solana.manifest,
            programs: {
              liqsolCore: {
                ...CurrentOutpostArtifactSuite.solana.manifest.programs
                  .liqsolCore,
                programBinarySha256: "f".repeat(64)
              }
            }
          }
        }
      },
      candidates = jest
        .spyOn(OutpostArtifactRegistry, "candidates")
        .mockReturnValue([rejected, CurrentOutpostArtifactSuite])
    try {
      const provider = createSolanaProviderFixture(profile)
      await expect(
        OutpostDeploymentVerifier.verify({
          family: OutpostChainFamily.solana,
          profile,
          connection: provider.connection
        })
      ).resolves.toBe(CurrentOutpostArtifactSuite)
    } finally {
      candidates.mockRestore()
    }
  })

  it("exports the canonical Solana upgradeable-loader identity", () => {
    expect(SolanaUpgradeableLoaderProgramId.toBase58()).toBe(
      "BPFLoaderUpgradeab1e11111111111111111111111"
    )
  })

  it.each([false, true])(
    "verifies an additional Solana build and rejects altered bytes (altered: %s)",
    async altered => {
      const binary = Buffer.from(SolanaV042Binary)
      if (altered) binary[0] ^= 1
      const profile = createOutpostDeploymentProfileFixture(),
        programData = createSolanaProgramDataAccountData(binary),
        program = profile.solana.programs[SolanaProgramName.liqsolCore]
      program.idlSha256 = SolanaV042Artifact.idlSha256
      program.programDataSha256 = sha256(programData).slice(2)
      await expect(
        OutpostDeploymentVerifier.verify({
          family: OutpostChainFamily.ethereum,
          profile,
          provider: createEthereumProviderFixture(profile)
        })
      ).resolves.toMatchObject({
        ethereum: { manifest: { package: { version: "0.4.3" } } }
      })
      const provider = createSolanaProviderFixture(profile, programData),
        verification = OutpostDeploymentVerifier.verify({
          family: OutpostChainFamily.solana,
          profile,
          connection: provider.connection
        })

      if (altered) {
        await expect(verification).rejects.toThrow("artifact program mismatch")
      } else {
        await expect(verification).resolves.toMatchObject({
          solana: { manifest: SolanaV042Manifest }
        })
      }
    }
  )
})
