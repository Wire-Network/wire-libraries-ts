import { AnchorProvider, Wallet } from "@coral-xyz/anchor"
import { Connection, Keypair, SystemProgram } from "@solana/web3.js"

import {
  Sim2Deployment,
  SolanaOutpostClient,
  SolanaProgramName
} from "@wireio/sdk-outpost"

function createProvider(): AnchorProvider {
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

describe("SolanaOutpostClient", () => {
  it("verifies the deployment and returns a generated program type", async () => {
    const provider = createProvider(),
      client = await SolanaOutpostClient.create({
        deployment: Sim2Deployment,
        provider
      }),
      program = client.program(SolanaProgramName.liqsolCore)

    expect(program.programId.toBase58()).toBe(
      Sim2Deployment.solana.programs[SolanaProgramName.liqsolCore].address
    )
  })

  it("rejects the wrong Solana cluster", async () => {
    const provider = createProvider()
    jest
      .spyOn(provider.connection, "getGenesisHash")
      .mockResolvedValue("9".repeat(32))

    await expect(
      SolanaOutpostClient.create({
        deployment: Sim2Deployment,
        provider
      })
    ).rejects.toThrow("Solana genesis mismatch")
  })

  it("rejects a configured program that is not executable", async () => {
    const provider = createProvider()
    jest.spyOn(provider.connection, "getAccountInfo").mockResolvedValue(null)

    await expect(
      SolanaOutpostClient.create({
        deployment: Sim2Deployment,
        provider
      })
    ).rejects.toThrow("is not executable")
  })
})
