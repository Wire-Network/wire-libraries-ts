import { AnchorProvider, Wallet } from "@coral-xyz/anchor"
import { Connection, Keypair, SystemProgram } from "@solana/web3.js"
import { providers } from "ethers"

import {
  EthereumOutpostClient,
  OutpostChainFamily,
  OutpostClient,
  SolanaOutpostClient
} from "@wireio/sdk-outpost"
import { createDeploymentFixture } from "../Fixtures.js"

function createSolanaProvider(
  deployment = createDeploymentFixture()
): AnchorProvider {
  const connection = new Connection("http://127.0.0.1:8899"),
    provider = new AnchorProvider(connection, new Wallet(Keypair.generate()))

  jest
    .spyOn(connection, "getGenesisHash")
    .mockResolvedValue(deployment.solana.genesisHash)
  jest.spyOn(connection, "getAccountInfo").mockResolvedValue({
    data: Buffer.alloc(0),
    executable: true,
    lamports: 1,
    owner: SystemProgram.programId,
    rentEpoch: 0
  })
  return provider
}

describe("OutpostClient", () => {
  it("preserves the precise Ethereum client type", async () => {
    const deployment = createDeploymentFixture(),
      provider = new providers.JsonRpcProvider()
    jest.spyOn(provider, "getNetwork").mockResolvedValue({
      chainId: deployment.ethereum.chainId,
      name: "wire-outpost"
    })
    jest.spyOn(provider, "getCode").mockResolvedValue("0x01")

    const client = await OutpostClient.create({
      family: OutpostChainFamily.ethereum,
      options: {
        deployment,
        connection: provider
      }
    })

    expect(client).toBeInstanceOf(EthereumOutpostClient)
  })

  it("preserves the precise Solana client type", async () => {
    const deployment = createDeploymentFixture()
    const client = await OutpostClient.create({
      family: OutpostChainFamily.solana,
      options: {
        deployment,
        provider: createSolanaProvider(deployment)
      }
    })

    expect(client).toBeInstanceOf(SolanaOutpostClient)
  })
})
