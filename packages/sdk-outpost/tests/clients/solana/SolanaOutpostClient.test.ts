import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js"
import { sha256 } from "ethers"

import {
  OutpostChainFamily,
  OutpostClient,
  type ReserveSwapRequest,
  SolanaProgramName,
  SolanaReserveClient,
  SolanaReserveSwapClient,
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
const SubmittedSignature = "3".repeat(64)
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

const reserveSwapRequest: ReserveSwapRequest = {
  sourceTokenCode: 1,
  sourceReserveCode: 2,
  sourceAmount: 3,
  targetChainCode: 4,
  targetTokenCode: 5,
  targetReserveCode: 6,
  targetRecipient: Uint8Array.from([7]),
  targetAmount: 8,
  targetToleranceBps: 500
}

function unsigned64Seed(value: bigint): Buffer {
  const seed = Buffer.alloc(8)
  seed.writeBigUInt64LE(value)
  return seed
}

describe("SolanaOutpostClient", () => {
  it("verifies a profile and returns its runtime program address", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createSolanaProviderFixture(profile),
      client = await createSolanaClient({ profile, provider }),
      program = client.program(SolanaProgramName.liqsolCore)

    expect(program.programId.toBase58()).toBe(
      profile.solana.programs[SolanaProgramName.liqsolCore].address
    )
    expect(client.reserves).toBeInstanceOf(SolanaReserveClient)
    expect(client.swaps).toBeInstanceOf(SolanaReserveSwapClient)
  })

  it("parses the protocol deposit id from confirmed program logs", () => {
    expect(
      SolanaReserveSwapClient.parseSourceRequestId([
        "Program log: opp_outpost: SwapDeposit id=42 hash=abc"
      ])
    ).toBe(42n)
    expect(() => SolanaReserveSwapClient.parseSourceRequestId([])).toThrow(
      "did not log SwapDeposit"
    )
  })

  it("derives native reserve accounts from the deployed program seeds", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createSolanaProviderFixture(profile),
      client = await createSolanaClient({ profile, provider }),
      instruction = await client.swaps.createNativeInstruction(
        reserveSwapRequest
      ),
      programAddress = new PublicKey(
        profile.solana.programs[SolanaProgramName.liqsolCore].address
      ),
      expectedReserve = PublicKey.findProgramAddressSync(
        [
          Buffer.from("reserve"),
          unsigned64Seed(1n),
          unsigned64Seed(2n)
        ],
        programAddress
      )[0]

    expect(instruction.keys[2].pubkey.equals(expectedReserve)).toBe(true)
  })

  it("derives SPL reserve vaults from the deployed program seeds", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createSolanaProviderFixture(profile),
      client = await createSolanaClient({ profile, provider }),
      instruction = await client.swaps.createSplInstruction({
        ...reserveSwapRequest,
        mint: Keypair.generate().publicKey
      }),
      programAddress = new PublicKey(
        profile.solana.programs[SolanaProgramName.liqsolCore].address
      ),
      expectedVault = PublicKey.findProgramAddressSync(
        [
          Buffer.from("reserve_vault"),
          unsigned64Seed(1n),
          unsigned64Seed(2n)
        ],
        programAddress
      )[0]

    expect(instruction.keys[3].pubkey.equals(expectedVault)).toBe(true)
  })

  it("polls a submitted reserve swap until Solana confirms it", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createSolanaProviderFixture(profile),
      client = await createSolanaClient({ profile, provider }),
      instruction = SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: provider.wallet.publicKey,
        lamports: 1
      })
    jest.spyOn(client.swaps, "createNativeInstruction").mockResolvedValue(instruction)
    jest.spyOn(provider.connection, "getLatestBlockhash").mockResolvedValue({
      blockhash: Keypair.generate().publicKey.toBase58(),
      lastValidBlockHeight: 100
    })
    jest.spyOn(provider.connection, "sendRawTransaction").mockResolvedValue(SubmittedSignature)
    jest.spyOn(provider.connection, "getSignatureStatuses").mockResolvedValue({
      context: { slot: 10 },
      value: [{ slot: 10, confirmations: 1, err: null, confirmationStatus: "confirmed" }]
    })
    jest.spyOn(provider.connection, "getBlockHeight").mockResolvedValue(10)
    jest.spyOn(provider.connection, "getTransaction").mockResolvedValue({
      meta: { logMessages: ["Program log: opp_outpost: SwapDeposit id=42 hash=abc"] }
    } as never)

    await expect(client.swaps.requestNative(reserveSwapRequest)).resolves.toEqual({
      transactionId: SubmittedSignature,
      sourceRequestId: 42n
    })
  })

  it("reports an explicit on-chain reserve swap failure", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createSolanaProviderFixture(profile),
      client = await createSolanaClient({ profile, provider }),
      instruction = SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: provider.wallet.publicKey,
        lamports: 1
      })
    jest.spyOn(client.swaps, "createNativeInstruction").mockResolvedValue(instruction)
    jest.spyOn(provider.connection, "getLatestBlockhash").mockResolvedValue({
      blockhash: Keypair.generate().publicKey.toBase58(),
      lastValidBlockHeight: 100
    })
    jest.spyOn(provider.connection, "sendRawTransaction").mockResolvedValue(SubmittedSignature)
    jest.spyOn(provider.connection, "getSignatureStatuses").mockResolvedValue({
      context: { slot: 10 },
      value: [{ slot: 10, confirmations: 1, err: { InstructionError: [2, "Custom"] }, confirmationStatus: "confirmed" }]
    })
    jest.spyOn(provider.connection, "getBlockHeight").mockResolvedValue(10)

    await expect(client.swaps.requestNative(reserveSwapRequest)).rejects.toThrow(
      `Solana reserve swap ${SubmittedSignature} failed`
    )
  })

  it("rejects the wrong Solana cluster", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createSolanaProviderFixture(profile)
    jest
      .spyOn(provider.connection, "getGenesisHash")
      .mockResolvedValue("9".repeat(32))

    await expect(
      createSolanaClient({ profile, provider })
    ).rejects.toThrow("Solana genesis mismatch")
  })

  it("rejects a configured program that is not executable", async () => {
    const profile = createOutpostDeploymentProfileFixture(),
      provider = createSolanaProviderFixture(profile)
    jest.spyOn(provider.connection, "getAccountInfo").mockResolvedValue(null)

    await expect(
      createSolanaClient({ profile, provider })
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
      createSolanaClient({ profile, provider })
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
      createSolanaClient({ profile, provider })
    ).rejects.toThrow("ProgramData mismatch")
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

    await expect(
      createSolanaClient({ profile, provider })
    ).rejects.toThrow("artifact program mismatch")
  })
})
