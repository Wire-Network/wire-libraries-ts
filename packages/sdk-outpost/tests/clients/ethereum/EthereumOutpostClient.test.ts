import { utils as ethersUtils } from "ethers"

import {
  EthereumContractName,
  EthereumOutpostClient
} from "@wireio/sdk-outpost"
import {
  createEthereumProviderFixture,
  createOutpostDeploymentProfileFixture
} from "../../Fixtures.js"

describe("EthereumOutpostClient", () => {
  it("verifies a profile and returns a generated contract type", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createEthereumProviderFixture(profile),
      client = await EthereumOutpostClient.create({
        profile,
        connection: provider
      }),
      reserveManager = client.contract(EthereumContractName.ReserveManager)

    expect(reserveManager.address).toBe(
      profile.ethereum.contracts[EthereumContractName.ReserveManager].address
    )
    expect(provider.getCode).toHaveBeenCalledTimes(
      Object.values(EthereumContractName).length * 2
    )
    expect(provider.getStorageAt).toHaveBeenCalledTimes(
      Object.values(EthereumContractName).length
    )
  })

  it("rejects the wrong Ethereum chain", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createEthereumProviderFixture(profile)
    jest.spyOn(provider, "getNetwork").mockResolvedValue({
      chainId: 1,
      name: "mainnet"
    })

    await expect(
      EthereumOutpostClient.create({ profile, connection: provider })
    ).rejects.toThrow("Ethereum chain mismatch")
  })

  it("rejects a configured proxy without bytecode", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createEthereumProviderFixture(profile)
    jest.spyOn(provider, "getCode").mockResolvedValue("0x")

    await expect(
      EthereumOutpostClient.create({ profile, connection: provider })
    ).rejects.toThrow("is not deployed")
  })

  it("rejects an implementation address mismatch", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createEthereumProviderFixture(profile)
    jest
      .spyOn(provider, "getStorageAt")
      .mockResolvedValue(ethersUtils.hexZeroPad("0x01", 32))

    await expect(
      EthereumOutpostClient.create({ profile, connection: provider })
    ).rejects.toThrow("implementation mismatch")
  })

  it("rejects an implementation code mismatch", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createEthereumProviderFixture(profile)
    profile.ethereum.contracts[
      EthereumContractName.ReserveManager
    ].implementationCodeSha256 = "f".repeat(64)

    await expect(
      EthereumOutpostClient.create({ profile, connection: provider })
    ).rejects.toThrow("implementation code mismatch")
  })
})
