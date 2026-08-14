import {
  OutpostChainFamily,
  OutpostClient,
  type EthereumOutpostClient,
  type SolanaOutpostClient
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
      }),
      typedClient: EthereumOutpostClient = client

    expect(typedClient.profile).toBe(profile)
    expect(typedClient.reserves).toBeDefined()
  })

  it("preserves the precise Solana client type", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      client = await OutpostClient.create({
        family: OutpostChainFamily.solana,
        options: {
          profile,
          provider: createSolanaProviderFixture(profile)
        }
      }),
      typedClient: SolanaOutpostClient = client

    expect(typedClient.profile).toBe(profile)
    expect(typedClient.reserves).toBeDefined()
  })
})
