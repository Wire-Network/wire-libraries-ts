import { providers } from "ethers"

import {
  EthereumContractName,
  EthereumOutpostClient,
  OutpostDeployments,
  type OutpostDeployment
} from "@wireio/sdk-outpost"

const DeployedCode = "0x01"

function createProvider(
  deployment: OutpostDeployment
): providers.JsonRpcProvider {
  const provider = new providers.JsonRpcProvider()
  jest.spyOn(provider, "getNetwork").mockResolvedValue({
    chainId: deployment.ethereum.chainId,
    name: "wire-outpost"
  })
  jest.spyOn(provider, "getCode").mockResolvedValue(DeployedCode)
  return provider
}

describe("EthereumOutpostClient", () => {
  it.each(OutpostDeployments)(
    "verifies $id and returns a generated contract type",
    async deployment => {
      const provider = createProvider(deployment),
        client = await EthereumOutpostClient.create({
          deployment,
          connection: provider
        }),
        reserveManager = client.contract(EthereumContractName.ReserveManager)

      expect(reserveManager.address).toBe(
        deployment.ethereum.contracts[EthereumContractName.ReserveManager]
          .address
      )
      expect(provider.getCode).toHaveBeenCalledTimes(
        Object.values(EthereumContractName).length
      )
    }
  )

  it("rejects the wrong Ethereum chain", async () => {
    const deployment = OutpostDeployments[0],
      provider = createProvider(deployment)
    jest.spyOn(provider, "getNetwork").mockResolvedValue({
      chainId: 1,
      name: "mainnet"
    })

    await expect(
      EthereumOutpostClient.create({
        deployment,
        connection: provider
      })
    ).rejects.toThrow("Ethereum chain mismatch")
  })

  it("rejects a configured contract without bytecode", async () => {
    const deployment = OutpostDeployments[0],
      provider = createProvider(deployment)
    jest.spyOn(provider, "getCode").mockResolvedValue("0x")

    await expect(
      EthereumOutpostClient.create({
        deployment,
        connection: provider
      })
    ).rejects.toThrow("is not deployed")
  })
})
