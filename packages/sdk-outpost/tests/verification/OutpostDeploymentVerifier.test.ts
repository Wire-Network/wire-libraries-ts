import {
  OutpostChainFamily,
  OutpostDeploymentVerifier,
  SolanaProgramName,
  SolanaUpgradeableLoaderProgramId
} from "@wireio/sdk-outpost"
import { SolanaOutpostArtifactManifest as SolanaV040Manifest } from "@wireio/outpost-solana-artifacts-v0-4-0"
import { sha256 } from "ethers"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import {
  createEthereumProviderFixture,
  createOutpostDeploymentProfileFixture,
  createSolanaProgramDataAccountData,
  createSolanaProviderFixture
} from "../Fixtures.js"

const PackageRequire = createRequire(__filename),
  SolanaV040Package = "@wireio/outpost-solana-artifacts-v0-4-0",
  SolanaV040Artifact = SolanaV040Manifest.programs.liqsolCore,
  SolanaV040Binary = readFileSync(
    PackageRequire.resolve(
      `${SolanaV040Package}/${SolanaV040Artifact.programBinaryPath}`
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
    ).resolves.toBeUndefined()
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
    ).resolves.toBeUndefined()
  })

  it("exports the canonical Solana upgradeable-loader identity", () => {
    expect(SolanaUpgradeableLoaderProgramId.toBase58()).toBe(
      "BPFLoaderUpgradeab1e11111111111111111111111"
    )
  })

  it.each([false, true])(
    "verifies the retained Solana runtime and rejects altered bytes (altered: %s)",
    async altered => {
      const binary = Buffer.from(SolanaV040Binary)
      if (altered) binary[0] ^= 1
      const profile = createOutpostDeploymentProfileFixture(
          "@wireio/outpost-ethereum-artifacts-v0-4-1"
        ),
        programData = createSolanaProgramDataAccountData(binary),
        program = profile.solana.programs[SolanaProgramName.liqsolCore]
      program.idlSha256 = SolanaV040Artifact.idlSha256
      program.programDataSha256 = sha256(programData).slice(2)
      await expect(
        OutpostDeploymentVerifier.verify({
          family: OutpostChainFamily.ethereum,
          profile,
          provider: createEthereumProviderFixture(
            profile,
            "@wireio/outpost-ethereum-artifacts-v0-4-1"
          )
        })
      ).resolves.toBeUndefined()
      const provider = createSolanaProviderFixture(profile, programData),
        verification = OutpostDeploymentVerifier.verify({
          family: OutpostChainFamily.solana,
          profile,
          connection: provider.connection
        })

      if (altered) {
        await expect(verification).rejects.toThrow("artifact program mismatch")
      } else {
        await expect(verification).resolves.toBeUndefined()
      }
    }
  )
})
