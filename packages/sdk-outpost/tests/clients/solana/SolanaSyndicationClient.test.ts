import {
  AnchorProvider,
  BN,
  BorshInstructionCoder,
  Program,
  Wallet
} from "@coral-xyz/anchor"
import { Connection, Keypair, PublicKey, StakeProgram } from "@solana/web3.js"
import {
  liqsolCoreIdl,
  type LiqsolCore
} from "@wireio/outpost-solana-artifacts"
import { SlugName } from "@wireio/sdk-core"
import { type SolanaSyndicationState } from "@wireio/sdk-outpost"
import { SolanaSyndicationClient } from "@wireio/sdk-outpost/clients/solana/SolanaSyndicationClient"

/** Build real producer-IDL instructions against an in-memory readiness fixture. */
function fixture(mockRead = true) {
  const wallet = new Wallet(Keypair.generate()),
    provider = new AnchorProvider(
      new Connection("https://example.invalid"),
      wallet,
      {}
    ),
    program = new Program<LiqsolCore>(liqsolCoreIdl, provider),
    client = new SolanaSyndicationClient(program, {
      tokenProgramAddress: Keypair.generate().publicKey.toBase58(),
      transferHookProgramAddress: Keypair.generate().publicKey.toBase58()
    }),
    state: SolanaSyndicationState = {
      nativeBalance: 2_500_000_000n,
      liquidBalance: 2_000_000_000n,
      decimals: 9,
      minimumDeposit: 10_000_000n,
      maximumSyndication: 10_000_000_000n,
      depositEnabled: true,
      postLaunch: true,
      mapped: true,
      paused: false
    }
  if (mockRead) jest.spyOn(client, "read").mockImplementation(async () => state)
  const globalConfig = program.account.globalConfig,
    payRateHistory = program.account.payRateHistory,
    config = jest.spyOn(globalConfig, "fetch").mockResolvedValue({
      depositFeeMultiplier: 2
    } as Awaited<ReturnType<typeof globalConfig.fetch>>),
    history = jest.spyOn(payRateHistory, "fetch").mockResolvedValue({
      currentIndex: 0,
      totalEntriesAdded: new BN(0),
      maxEntries: 10,
      entries: []
    } as Awaited<ReturnType<typeof payRateHistory.fetch>>)
  return { client, program, user: wallet.publicKey, state, config, history }
}

describe("Solana syndication", () => {
  it.each([
    [
      0,
      0,
      [191780821, 191780821, 191780821, 191780821, 191780821, 999999999],
      2_000_000_000n,
      767124n
    ],
    [2, 12, [100, 200, 300, 400, 500, 600], 1_000_000_000_000n, 720n],
    [0, 0, [1, 2, 0, 0, 0, 999999999], 1_000_000_000_000n, 4n],
    [0, 0, [0, 0, 0], 2_000_000_000n, 0n],
    [0, 0, [], 2_000_000_000n, 0n]
  ])(
    "quotes circular history %i/%i with contract ceiling rounding",
    async (currentIndex, totalEntriesAdded, rates, amount, fee) => {
      const { client, history } = fixture()
      history.mockResolvedValue({
        currentIndex,
        totalEntriesAdded: new BN(totalEntriesAdded),
        maxEntries: 6,
        entries: rates.map(rate => ({
          timestamp: new BN(0),
          scaledRate: new BN(rate)
        })),
        bump: 0
      })
      await expect(client.quoteDeposit(amount)).resolves.toEqual({
        amount,
        fee,
        totalDebit: amount + fee
      })
    }
  )

  it("rounds the average up before rounding the fee and propagates unavailable quotes", async () => {
    const { client, history } = fixture()
    history.mockResolvedValue({
      currentIndex: 0,
      totalEntriesAdded: new BN(0),
      maxEntries: 2,
      entries: [1, 2].map(rate => ({
        timestamp: new BN(0),
        scaledRate: new BN(rate)
      })),
      bump: 0
    })
    await expect(client.quoteDeposit(250_000_000_001n)).resolves.toMatchObject({
      fee: 2n
    })
    await expect(client.quoteDeposit(0n)).rejects.toThrow("positive u64")
    await expect(client.quoteDeposit(1n << 64n)).rejects.toThrow("positive u64")
    await expect(client.quoteDeposit((1n << 64n) - 1n)).rejects.toThrow(
      "contract limit"
    )
    history.mockRejectedValueOnce(new Error("Pay-rate RPC unavailable"))
    await expect(client.quoteDeposit(1n)).rejects.toThrow(
      "Pay-rate RPC unavailable"
    )
  })

  it("rejects deposits whose protocol fee consumes the remaining wallet balance", async () => {
    const { client, user, state, history } = fixture()
    state.nativeBalance = 2_000_767_124n
    history.mockResolvedValue({
      currentIndex: 0,
      totalEntriesAdded: new BN(0),
      maxEntries: 1,
      entries: [{ timestamp: new BN(0), scaledRate: new BN(191780821) }],
      bump: 0
    })
    await expect(client.deposit(user, 2_000_000_000n, 42)).rejects.toThrow(
      "plus protocol fee"
    )
  })

  it("reads real admission gates and refuses mismatched mint or companion identities", async () => {
    const { client, program, user } = fixture(false),
      addresses = client.addresses(user),
      tokenCode = new BN(SlugName.from("LIQSOL")),
      globalConfig = program.account.globalConfig,
      globalState = program.account.globalState,
      outpostConfig = program.account.outpostConfig,
      distributionState = program.account.distributionState,
      state = { wireState: { postLaunch: {} }, paused: false, frozen: false },
      mapping = {
        tokenAddressesByCode: [{ tokenCode, mint: addresses.liqsolMint }],
        precisionByTokenCode: [{ tokenCode, decimals: 9 }]
      },
      connection = program.provider.connection

    jest.spyOn(globalConfig, "fetch").mockResolvedValue({
      minUserDeposit: new BN(10),
      maxSyndicationPerTransfer: new BN(100),
      featureFlags: 1
    } as Awaited<ReturnType<typeof globalConfig.fetch>>)
    jest
      .spyOn(globalState, "fetch")
      .mockResolvedValue(state as Awaited<ReturnType<typeof globalState.fetch>>)
    jest
      .spyOn(outpostConfig, "fetch")
      .mockResolvedValue(
        mapping as Awaited<ReturnType<typeof outpostConfig.fetch>>
      )
    const distribution = jest
      .spyOn(distributionState, "fetch")
      .mockResolvedValue({
        liqsolMint: addresses.liqsolMint
      } as Awaited<ReturnType<typeof distributionState.fetch>>)
    jest.spyOn(connection, "getAccountInfo").mockResolvedValue(null)
    jest.spyOn(connection, "getBalance").mockResolvedValue(2_500_000_000)
    const companions = jest
      .spyOn(connection, "getMultipleAccountsInfo")
      .mockResolvedValue(
        [addresses.liqsolProgram, addresses.transferHookProgram].map(owner => ({
          owner,
          executable: true,
          data: Buffer.alloc(0),
          lamports: 1
        }))
      )

    await expect(client.read(user)).resolves.toMatchObject({
      nativeBalance: 2_500_000_000n,
      liquidBalance: 0n,
      minimumDeposit: 10n,
      maximumSyndication: 100n,
      depositEnabled: true,
      postLaunch: true,
      mapped: true,
      paused: false
    })
    mapping.precisionByTokenCode[0].decimals = 6
    state.paused = true
    await expect(client.read(user)).resolves.toMatchObject({
      mapped: false,
      paused: true
    })
    distribution.mockResolvedValueOnce({
      liqsolMint: PublicKey.default
    } as Awaited<ReturnType<typeof distributionState.fetch>>)
    await expect(client.read(user)).rejects.toThrow("do not match")
    companions.mockResolvedValueOnce([null, null])
    await expect(client.read(user)).rejects.toThrow("do not match")
    jest
      .spyOn(connection, "getBalance")
      .mockRejectedValueOnce(new Error("RPC unavailable"))
    await expect(client.read(user)).rejects.toThrow("RPC unavailable")
  })

  it("encodes a native deposit with the u32 seed and canonical ephemeral stake account", async () => {
    const { client, program, user } = fixture(),
      transaction = await client.deposit(user, 2_000_000_000n, 42),
      instruction = transaction.instructions[1],
      decoded = new BorshInstructionCoder(program.idl).decode(instruction.data),
      ephemeral = await PublicKey.createWithSeed(
        user,
        "ephemeral_42",
        StakeProgram.programId
      )
    expect(decoded?.name).toBe("solToLiqsol")
    expect(decoded?.data).toEqual({
      amount: expect.objectContaining({}),
      seed: 42
    })
    expect(instruction.keys.some(key => key.pubkey.equals(ephemeral))).toBe(
      true
    )
    expect(transaction.signatures).toEqual([])
  })

  it("rejects invalid seeds, balances and disabled deposits", async () => {
    const { client, user, state } = fixture()
    for (const seed of [-1, 0x100000000, 1.5])
      await expect(client.deposit(user, 20_000_000n, seed)).rejects.toThrow(
        "seed"
      )
    for (const amount of [0n, 1n, state.nativeBalance])
      await expect(client.deposit(user, amount, 1)).rejects.toThrow()
    state.depositEnabled = false
    await expect(client.deposit(user, 20_000_000n, 1)).rejects.toThrow(
      "disabled"
    )
  })

  it("refuses PreLaunch, missing LIQSOL mapping, pauses and insufficient balance", async () => {
    const { client, user, state } = fixture()
    state.postLaunch = false
    await expect(client.syndicate(user, 1n)).rejects.toThrow("PostLaunch")
    state.postLaunch = true
    state.mapped = false
    await expect(client.syndicate(user, 1n)).rejects.toThrow(
      "mint and precision"
    )
    state.mapped = true
    state.paused = true
    await expect(client.syndicate(user, 1n)).rejects.toThrow("paused")
    state.paused = false
    await expect(
      client.syndicate(user, state.liquidBalance + 1n)
    ).rejects.toThrow("limit")
  })

  it("constructs PostLaunch custody with the outbound buffer and no prelaunch position", async () => {
    const { client, program, user } = fixture(),
      transaction = await client.syndicate(user, 2_000_000_000n),
      instruction = transaction.instructions[1],
      addresses = client.addresses(user)
    expect(
      new BorshInstructionCoder(program.idl).decode(instruction.data)?.name
    ).toBe("synd")
    expect(
      instruction.keys.some(key =>
        key.pubkey.equals(addresses.outboundMessageBuffer)
      )
    ).toBe(true)
    expect(transaction.signatures).toEqual([])
  })
})
