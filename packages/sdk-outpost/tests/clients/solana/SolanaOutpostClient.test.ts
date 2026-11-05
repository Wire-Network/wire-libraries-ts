import { PublicKey } from "@solana/web3.js"
import { sha256 } from "ethers"
import {
  liqsolCoreIdl as devnetIdl,
  SolanaOutpostArtifactManifest
} from "@wireio/outpost-solana-artifacts-v0-4-6"
import { CurrentOutpostArtifactSuite } from "@wireio/sdk-outpost/artifacts/Registry"

import {
  OutpostChainFamily,
  OutpostClient,
  OutpostDeploymentVerifier,
  SolanaProgramName,
  SolanaUpgradeableLoaderProgramId,
  type SolanaOutpostClient,
  type SolanaOutpostClientOptions
} from "@wireio/sdk-outpost"
import {
  createOutpostDeploymentProfileFixture,
  createSolanaProgramAccountData,
  createSolanaProgramDataAccountData,
  createSolanaProviderFixture
} from "../../Fixtures.js"

const WrongProgramDataAddress = "SysvarRent111111111111111111111111111111111"
const SolanaProgramDataMetadataByteLength = 45

/** Create the Solana client through the package's only public facade. */
function createSolanaClient(
  options: SolanaOutpostClientOptions
): Promise<SolanaOutpostClient> {
  return OutpostClient.create({
    family: OutpostChainFamily.solana,
    options
  })
}

describe("SolanaOutpostClient", () => {
  it("decodes the 500-epoch history of the verified Devnet program", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createSolanaProviderFixture(profile),
      verified = jest
        .spyOn(OutpostDeploymentVerifier, "verify")
        .mockResolvedValueOnce({
          ...CurrentOutpostArtifactSuite,
          solana: {
            manifest: SolanaOutpostArtifactManifest,
            idls: { liqsolCore: devnetIdl }
          }
        })
    try {
      const client = await createSolanaClient({ profile, provider }),
        program = client.program(SolanaProgramName.liqsolCore),
        data = Buffer.alloc(8032)
      Buffer.from(
        devnetIdl.accounts.find(
          account => account.name === "pretokenPurchaseHistory"
        )!.discriminator
      ).copy(data)
      data.writeBigUInt64LE(7n, 24 + 500 * 8)
      data[8024] = 255
      const decoded = program.coder.accounts.decode(
        "pretokenPurchaseHistory",
        data
      )
      expect(decoded.syndPerEpoch).toHaveLength(500)
      expect(decoded.syndPerEpoch[0].toString()).toBe("7")
      expect(decoded.bump).toBe(255)
    } finally {
      verified.mockRestore()
    }
  })

  it("verifies a profile and returns its runtime program address", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createSolanaProviderFixture(profile),
      client = await createSolanaClient({ profile, provider }),
      program = client.program(SolanaProgramName.liqsolCore)

    expect(program.programId.toBase58()).toBe(
      profile.solana.programs[SolanaProgramName.liqsolCore].address
    )
  })

  it("keeps cluster genesis verification scoped to each client", async () => {
    const first = createOutpostDeploymentProfileFixture(),
      second = createOutpostDeploymentProfileFixture()
    second.solana.genesisHash = WrongProgramDataAddress
    const firstProvider = createSolanaProviderFixture(first),
      secondProvider = createSolanaProviderFixture(second),
      [firstClient, secondClient] = await Promise.all([
        createSolanaClient({ profile: first, provider: firstProvider }),
        createSolanaClient({ profile: second, provider: secondProvider })
      ])
    expect(firstClient.profile.solana.genesisHash).toBe(
      first.solana.genesisHash
    )
    expect(secondClient.profile.solana.genesisHash).toBe(
      second.solana.genesisHash
    )
    await expect(
      createSolanaClient({ profile: first, provider: secondProvider })
    ).rejects.toThrow("Solana genesis mismatch")
  })

  it("rejects the wrong Solana cluster", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createSolanaProviderFixture(profile)
    jest
      .spyOn(provider.connection, "getGenesisHash")
      .mockResolvedValue("9".repeat(32))

    await expect(createSolanaClient({ profile, provider })).rejects.toThrow(
      "Solana genesis mismatch"
    )
  })

  it("rejects a configured program that is not executable", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createSolanaProviderFixture(profile)
    jest.spyOn(provider.connection, "getAccountInfo").mockResolvedValue(null)

    await expect(createSolanaClient({ profile, provider })).rejects.toThrow(
      "is not executable"
    )
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

    await expect(createSolanaClient({ profile, provider })).rejects.toThrow(
      "ProgramData mismatch"
    )
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

    await expect(createSolanaClient({ profile, provider })).rejects.toThrow(
      "ProgramData mismatch"
    )
  })

  it("rejects ProgramData executable bytes from another producer binary", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      program = profile.solana.programs[SolanaProgramName.liqsolCore],
      incompatibleProgramData = createSolanaProgramDataAccountData()
    incompatibleProgramData[SolanaProgramDataMetadataByteLength] ^= 1
    program.programDataSha256 = sha256(incompatibleProgramData).slice(2)
    const provider = createSolanaProviderFixture(profile)
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
              data: incompatibleProgramData,
              executable: false,
              lamports: 1,
              owner: SolanaUpgradeableLoaderProgramId,
              rentEpoch: 0
            }
      )

    await expect(createSolanaClient({ profile, provider })).rejects.toThrow(
      "artifact program mismatch"
    )
  })
})
