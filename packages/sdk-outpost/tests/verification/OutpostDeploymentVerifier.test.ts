import {
  OutpostChainFamily,
  OutpostDeploymentVerifier,
  SolanaUpgradeableLoaderProgramId
} from "@wireio/sdk-outpost"
import { CurrentOutpostArtifactSuite } from "@wireio/sdk-outpost/artifacts/Registry"
import {
  createEthereumProviderFixture,
  createOutpostDeploymentProfileFixture,
  createSolanaProviderFixture
} from "../Fixtures.js"

describe("OutpostDeploymentVerifier", () => {
  it("verifies Ethereum against the current producer runtime", async () => {
    const profile = createOutpostDeploymentProfileFixture()
    await expect(
      OutpostDeploymentVerifier.verify({
        family: OutpostChainFamily.ethereum,
        profile,
        provider: createEthereumProviderFixture(profile)
      })
    ).resolves.toBe(CurrentOutpostArtifactSuite)
  })

  it("verifies Solana against the current producer binary", async () => {
    const profile = createOutpostDeploymentProfileFixture()
    await expect(
      OutpostDeploymentVerifier.verify({
        family: OutpostChainFamily.solana,
        profile,
        connection: createSolanaProviderFixture(profile).connection
      })
    ).resolves.toBe(CurrentOutpostArtifactSuite)
  })

  it("rejects a retired paired interface before querying Ethereum", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createEthereumProviderFixture(profile),
      getNetwork = jest.spyOn(provider, "getNetwork")
    profile.solana.programs.liqsolCore.idlSha256 =
      "e3650e76f9eed4db25d2720a2be108fe85420d6cb366c8089044655879cf8915"
    await expect(
      OutpostDeploymentVerifier.verify({
        family: OutpostChainFamily.ethereum,
        profile,
        provider
      })
    ).rejects.toThrow("IDL interface mismatch")
    expect(getNetwork).not.toHaveBeenCalled()
  })

  it("rejects a mixed Ethereum interface before querying Solana", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createSolanaProviderFixture(profile),
      getGenesisHash = jest.spyOn(provider.connection, "getGenesisHash")
    profile.ethereum.contracts.BAR.abiSha256 = "f".repeat(64)
    await expect(
      OutpostDeploymentVerifier.verify({
        family: OutpostChainFamily.solana,
        profile,
        connection: provider.connection
      })
    ).rejects.toThrow("ABI interface mismatch")
    expect(getGenesisHash).not.toHaveBeenCalled()
  })

  it("rejects runtime drift without trying an older contract", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createEthereumProviderFixture(profile)
    jest.spyOn(provider, "getCode").mockResolvedValue("0x01")
    await expect(
      OutpostDeploymentVerifier.verify({
        family: OutpostChainFamily.ethereum,
        profile,
        provider
      })
    ).rejects.toThrow(/mismatch/)
  })

  it("exports the canonical Solana upgradeable-loader identity", () => {
    expect(SolanaUpgradeableLoaderProgramId.toBase58()).toBe(
      "BPFLoaderUpgradeab1e11111111111111111111111"
    )
  })
})
