import {
  EthereumOutpostClient,
  OutpostChainFamily,
  OutpostClient,
  SolanaOutpostClient
} from "@wireio/sdk-outpost"
import {
  createEthereumProviderFixture,
  createOutpostDeploymentProfileFixture,
  createSolanaProviderFixture
} from "../Fixtures.js"

describe("OutpostClient", () => {
  it("preserves the precise Ethereum client type", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      client = await OutpostClient.create({
        family: OutpostChainFamily.ethereum,
        options: {
          profile,
          connection: createEthereumProviderFixture(profile)
        }
      })

    expect(client).toBeInstanceOf(EthereumOutpostClient)
  })

  it("preserves the precise Solana client type", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      client = await OutpostClient.create({
        family: OutpostChainFamily.solana,
        options: {
          profile,
          provider: createSolanaProviderFixture(profile)
        }
      })

    expect(client).toBeInstanceOf(SolanaOutpostClient)
  })
})
