import { AnchorProvider, Wallet } from "@coral-xyz/anchor"
import { Connection, Keypair, SystemProgram } from "@solana/web3.js"
import { providers } from "ethers"

import {
  EthereumOutpostClient,
  OutpostChainFamily,
  OutpostClient,
  Sim2Deployment,
  SolanaOutpostClient
} from "@wireio/sdk-outpost"

function createSolanaProvider(): AnchorProvider {
  const connection = new Connection("http://127.0.0.1:8899"),
    provider = new AnchorProvider(connection, new Wallet(Keypair.generate()))

  jest
    .spyOn(connection, "getGenesisHash")
    .mockResolvedValue(Sim2Deployment.solana.genesisHash)
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
    const provider = new providers.JsonRpcProvider()
    jest.spyOn(provider, "getNetwork").mockResolvedValue({
      chainId: Sim2Deployment.ethereum.chainId,
      name: "sim2"
    })
    jest.spyOn(provider, "getCode").mockResolvedValue("0x01")

    const client = await OutpostClient.create({
      family: OutpostChainFamily.ethereum,
      options: {
        deployment: Sim2Deployment,
        connection: provider
      }
    })

    expect(client).toBeInstanceOf(EthereumOutpostClient)
  })

  it("preserves the precise Solana client type", async () => {
    const client = await OutpostClient.create({
      family: OutpostChainFamily.solana,
      options: {
        deployment: Sim2Deployment,
        provider: createSolanaProvider()
      }
    })

    expect(client).toBeInstanceOf(SolanaOutpostClient)
  })
})
