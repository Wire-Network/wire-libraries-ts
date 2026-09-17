import {
  OutpostChainFamily,
  OutpostDeploymentVerifier,
  SolanaUpgradeableLoaderProgramId
} from "@wireio/sdk-outpost"
import {
  createEthereumProviderFixture,
  createOutpostDeploymentProfileFixture,
  createSolanaProviderFixture
} from "../Fixtures.js"

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
})
