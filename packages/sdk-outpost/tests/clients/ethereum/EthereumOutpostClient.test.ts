import { providers } from "ethers"

import {
  EthereumContractName,
  EthereumOutpostClient,
  Sim2Deployment
} from "@wireio/sdk-outpost"

const DeployedCode = "0x01"

function createProvider(): providers.JsonRpcProvider {
  const provider = new providers.JsonRpcProvider()
  jest.spyOn(provider, "getNetwork").mockResolvedValue({
    chainId: Sim2Deployment.ethereum.chainId,
    name: "sim2"
  })
  jest.spyOn(provider, "getCode").mockResolvedValue(DeployedCode)
  return provider
}

describe("EthereumOutpostClient", () => {
  it("verifies the deployment and returns a generated contract type", async () => {
    const provider = createProvider(),
      client = await EthereumOutpostClient.create({
        deployment: Sim2Deployment,
        connection: provider
      }),
      reserveManager = client.contract(EthereumContractName.ReserveManager)

    expect(reserveManager.address).toBe(
      Sim2Deployment.ethereum.contracts[EthereumContractName.ReserveManager]
        .address
    )
    expect(provider.getCode).toHaveBeenCalledTimes(
      Object.values(EthereumContractName).length
    )
  })

  it("rejects the wrong Ethereum chain", async () => {
    const provider = createProvider()
    jest.spyOn(provider, "getNetwork").mockResolvedValue({
      chainId: 1,
      name: "mainnet"
    })

    await expect(
      EthereumOutpostClient.create({
        deployment: Sim2Deployment,
        connection: provider
      })
    ).rejects.toThrow("Ethereum chain mismatch")
  })

  it("rejects a configured contract without bytecode", async () => {
    const provider = createProvider()
    jest.spyOn(provider, "getCode").mockResolvedValue("0x")

    await expect(
      EthereumOutpostClient.create({
        deployment: Sim2Deployment,
        connection: provider
      })
    ).rejects.toThrow("is not deployed")
  })
})
