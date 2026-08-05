import { PublicKey } from "@solana/web3.js"

import {
  SolanaOutpostClient,
  SolanaProgramName,
  SolanaUpgradeableLoaderProgramId
} from "@wireio/sdk-outpost"
import {
  createOutpostDeploymentProfileFixture,
  createSolanaProgramAccountData,
  createSolanaProgramDataAccountData,
  createSolanaProviderFixture
} from "../../Fixtures.js"

const WrongProgramDataAddress = "SysvarRent111111111111111111111111111111111"

describe("SolanaOutpostClient", () => {
  it("verifies a profile and returns its runtime program address", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createSolanaProviderFixture(profile),
      client = await SolanaOutpostClient.create({ profile, provider }),
      program = client.program(SolanaProgramName.liqsolCore)

    expect(program.programId.toBase58()).toBe(
      profile.solana.programs[SolanaProgramName.liqsolCore].address
    )
  })

  it("rejects the wrong Solana cluster", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createSolanaProviderFixture(profile)
    jest
      .spyOn(provider.connection, "getGenesisHash")
      .mockResolvedValue("9".repeat(32))

    await expect(
      SolanaOutpostClient.create({ profile, provider })
    ).rejects.toThrow("Solana genesis mismatch")
  })

  it("rejects a configured program that is not executable", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createSolanaProviderFixture(profile)
    jest.spyOn(provider.connection, "getAccountInfo").mockResolvedValue(null)

    await expect(
      SolanaOutpostClient.create({ profile, provider })
    ).rejects.toThrow("is not executable")
  })

  it("rejects a Program account pointing at another ProgramData account", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createSolanaProviderFixture(profile)
    jest.spyOn(provider.connection, "getAccountInfo").mockResolvedValue({
      data: createSolanaProgramAccountData(WrongProgramDataAddress),
      executable: true,
      lamports: 1,
      owner: SolanaUpgradeableLoaderProgramId,
      rentEpoch: 0
    })

    await expect(
      SolanaOutpostClient.create({ profile, provider })
    ).rejects.toThrow("ProgramData mismatch")
  })

  it("rejects a ProgramData code mismatch", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createSolanaProviderFixture(profile),
      program = profile.solana.programs[SolanaProgramName.liqsolCore]
    program.programDataSha256 = "f".repeat(64)
    jest
      .spyOn(provider.connection, "getAccountInfo")
      .mockImplementation(async address =>
        address.equals(new PublicKey(program.address))
          ? {
              data: createSolanaProgramAccountData(program.programDataAddress),
              executable: true,
              lamports: 1,
              owner: SolanaUpgradeableLoaderProgramId,
              rentEpoch: 0
            }
          : {
              data: createSolanaProgramDataAccountData(),
              executable: false,
              lamports: 1,
              owner: SolanaUpgradeableLoaderProgramId,
              rentEpoch: 0
            }
      )

    await expect(
      SolanaOutpostClient.create({ profile, provider })
    ).rejects.toThrow("ProgramData mismatch")
  })
})
