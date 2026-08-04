import { AnchorProvider, Wallet } from "@coral-xyz/anchor"
import { Connection, Keypair, SystemProgram } from "@solana/web3.js"

import {
  type OutpostDeployment,
  SolanaOutpostClient,
  SolanaProgramName
} from "@wireio/sdk-outpost"
import { createDeploymentFixture } from "../../Fixtures.js"

function createProvider(deployment: OutpostDeployment): AnchorProvider {
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

describe("SolanaOutpostClient", () => {
  it("verifies a deployment and returns its runtime program address", async () => {
    const deployment = createDeploymentFixture(),
      provider = createProvider(deployment),
      client = await SolanaOutpostClient.create({
        deployment,
        provider
      }),
      program = client.program(SolanaProgramName.liqsolCore)

    expect(program.programId.toBase58()).toBe(
      deployment.solana.programs[SolanaProgramName.liqsolCore].address
    )
  })

  it("rejects the wrong Solana cluster", async () => {
    const deployment = createDeploymentFixture(),
      provider = createProvider(deployment)
    jest
      .spyOn(provider.connection, "getGenesisHash")
      .mockResolvedValue("9".repeat(32))

    await expect(
      SolanaOutpostClient.create({
        deployment,
        provider
      })
    ).rejects.toThrow("Solana genesis mismatch")
  })

  it("rejects a configured program that is not executable", async () => {
    const deployment = createDeploymentFixture(),
      provider = createProvider(deployment)
    jest.spyOn(provider.connection, "getAccountInfo").mockResolvedValue(null)

    await expect(
      SolanaOutpostClient.create({
        deployment,
        provider
      })
    ).rejects.toThrow("is not executable")
  })
})
