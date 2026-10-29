import {
  AnchorProvider,
  type IdlAccounts,
  BN,
  BorshInstructionCoder,
  Program,
  Wallet
} from "@coral-xyz/anchor"
import { Connection, Keypair, PublicKey } from "@solana/web3.js"
import {
  AccountLayout,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync
} from "@solana/spl-token"
import {
  liqsolCoreIdl,
  type LiqsolCore
} from "@wireio/outpost-solana-artifacts"
import {
  liqsolCoreIdl as legacyLiqsolCoreIdl,
  type LiqsolCore as LegacyLiqsolCore
} from "@wireio/outpost-solana-artifacts-v0-4-2"
import { SolanaSyndicationClient } from "@wireio/sdk-outpost/clients/solana/SolanaSyndicationClient"
import { SolanaWithdrawalClient } from "@wireio/sdk-outpost/clients/solana/SolanaWithdrawalClient"
import type { SolanaWithdrawalState } from "@wireio/sdk-outpost"

type WithdrawalConfigFixture = IdlAccounts<LiqsolCore>["globalConfig"] &
  IdlAccounts<LegacyLiqsolCore>["globalConfig"]

interface DecodedWithdrawalRequest {
  amount: BN
  nonce?: BN
}

function fixture(legacy = false) {
  const user = Keypair.generate().publicKey,
    provider = new AnchorProvider(
      new Connection("https://example.invalid"),
      new Wallet(Keypair.generate()),
      {}
    ),
    program = legacy
      ? new Program<LegacyLiqsolCore>(legacyLiqsolCoreIdl, provider)
      : new Program<LiqsolCore>(liqsolCoreIdl, provider),
    syndication = new SolanaSyndicationClient(program, {
      tokenProgramAddress: Keypair.generate().publicKey.toBase58(),
      transferHookProgramAddress: Keypair.generate().publicKey.toBase58()
    }),
    client = new SolanaWithdrawalClient(syndication),
    address = (seed: string, ...rest: Buffer[]) =>
      PublicKey.findProgramAddressSync(
        [Buffer.from(seed), ...rest],
        program.programId
      )[0],
    mint = address(
      "mint",
      ...(legacy
        ? [new BN("9007199254740993").toArrayLike(Buffer, "le", 8)]
        : [
            user.toBuffer(),
            new BN("9007199254740993").toArrayLike(Buffer, "le", 8)
          ])
    ),
    state: SolanaWithdrawalState = {
      minimum: 10n,
      enabled: true,
      claimsEnabled: true,
      serviceableEpoch: 8n,
      receipts: [
        { mint: mint.toBase58(), amount: 100n, epoch: 8n, claimable: true }
      ]
    }
  jest.spyOn(client, "read").mockResolvedValue(state)
  jest.spyOn(syndication, "read").mockResolvedValue({
    nativeBalance: 10000n,
    liquidBalance: 1000n,
    decimals: 9,
    minimumDeposit: 1n,
    minimumSyndication: 1_000_000n,
    maximumSyndication: 1000n,
    depositEnabled: false,
    postLaunch: true,
    mapped: true,
    paused: false
  })
  const _fetch = program.account.global.fetch
  jest
    .spyOn(program.account.global, "fetch")
    .mockResolvedValue({ nextReceiptId: new BN("9007199254740993") } as Awaited<
      ReturnType<typeof _fetch>
    >)
  return { client, program, user, syndication, mint, state, address }
}

describe("Solana native withdrawals", () => {
  it("builds the producer IDL request with a user nonce and user-owned receipt", async () => {
    const { client, user, program, syndication, address } = fixture(),
      tx = await client.request(user, 900n),
      instruction = tx.instructions[1],
      decoded = new BorshInstructionCoder(liqsolCoreIdl).decode(
        instruction.data
      )
    expect(decoded?.name).toBe("requestWithdraw")
    expect((decoded?.data as DecodedWithdrawalRequest).amount.toString()).toBe(
      "900"
    )
    const nonce = (decoded?.data as DecodedWithdrawalRequest).nonce!
    expect(nonce.bitLength()).toBeLessThanOrEqual(64)
    const mint = address(
        "mint",
        user.toBuffer(),
        nonce.toArrayLike(Buffer, "le", 8)
      ),
      names = liqsolCoreIdl.instructions
        .find(row => row.name === "requestWithdraw")!
        .accounts.map(row => row.name),
      accounts = Object.fromEntries(
        names.map((name, index) => [name, instruction.keys[index].pubkey])
      )
    expect(accounts.user.equals(user)).toBe(true)
    expect(accounts.owner.equals(user)).toBe(true)
    expect(accounts.nftMint.equals(mint)).toBe(true)
    expect(
      accounts.receiptData.equals(address("liq_receipt_data", mint.toBuffer()))
    ).toBe(true)
    expect(
      accounts.nftAta.equals(
        getAssociatedTokenAddressSync(mint, user, false, TOKEN_2022_PROGRAM_ID)
      )
    ).toBe(true)
    expect(
      accounts.liqsolMint.equals(syndication.addresses(user).liqsolMint)
    ).toBe(true)
    expect(accounts.tokenProgram.equals(TOKEN_2022_PROGRAM_ID)).toBe(true)
    expect(program.provider.publicKey?.equals(user)).toBe(false)
  })

  it("retains the verified older deployment's counter-based request encoding", async () => {
    const { client, user, mint } = fixture(true),
      transaction = await client.request(user, 900n),
      instruction = transaction.instructions[1],
      decoded = new BorshInstructionCoder(legacyLiqsolCoreIdl).decode(
        instruction.data
      ),
      names = legacyLiqsolCoreIdl.instructions
        .find(row => row.name === "requestWithdraw")!
        .accounts.map(row => row.name)
    expect((decoded?.data as DecodedWithdrawalRequest).amount.toString()).toBe(
      "900"
    )
    expect((decoded?.data as DecodedWithdrawalRequest).nonce).toBeUndefined()
    expect(instruction.keys[names.indexOf("nftMint")].pubkey.equals(mint)).toBe(
      true
    )
  })

  it("uses distinct receipt addresses for requests built before either lands", async () => {
    const { client, user } = fixture(),
      transactions = await Promise.all([
        client.request(user, 100n),
        client.request(user, 100n)
      ]),
      coder = new BorshInstructionCoder(liqsolCoreIdl),
      requests = transactions.map(
        transaction =>
          coder.decode(transaction.instructions[1].data)!
            .data as DecodedWithdrawalRequest
      )
    expect(requests[0].nonce!.toString()).not.toBe(
      requests[1].nonce!.toString()
    )
  })

  it("refuses disabled, below-minimum, over-balance and overflowing requests", async () => {
    const { client, user, state } = fixture()
    await Promise.all(
      [0n, 9n, 1001n, 1n << 64n].map(amount =>
        expect(client.request(user, amount)).rejects.toThrow(/minimum/)
      )
    )
    state.enabled = false
    await expect(client.request(user, 100n)).rejects.toThrow(/disabled/)
  })

  it("builds a claim only for the currently owned and serviceable receipt", async () => {
    const { client, user, mint } = fixture(),
      tx = await client.claim(user, mint.toBase58()),
      decoded = new BorshInstructionCoder(liqsolCoreIdl).decode(
        tx.instructions[0].data
      )
    expect(decoded?.name).toBe("claimWithdraw")
    expect(tx.instructions[0].keys[0].pubkey.equals(user)).toBe(true)
    await expect(
      client.claim(user, Keypair.generate().publicKey.toBase58())
    ).rejects.toThrow(/not owned/)
  })

  it("does not sign or claim early, disabled or already removed receipts", async () => {
    const { client, user, state, mint } = fixture()
    state.receipts[0].claimable = false
    await expect(client.claim(user, mint.toBase58())).rejects.toThrow(
      /serviceable/
    )
    state.receipts = []
    await expect(client.claim(user, mint.toBase58())).rejects.toThrow(
      /not owned/
    )
  })

  it("rediscovers frozen owned receipts after reconnect and uses live serviceability", async () => {
    const { client, user, program, mint } = fixture()
    jest.mocked(client.read).mockRestore()
    const globalFetch = program.account.global.fetch,
      _configFetch = program.account.globalConfig.fetch,
      _receiptFetch = program.account.liqReceiptData.fetchMultiple,
      data = Buffer.alloc(AccountLayout.span)
    AccountLayout.encode(
      {
        mint,
        owner: user,
        amount: 1n,
        delegateOption: 0,
        delegate: PublicKey.default,
        state: 2,
        isNativeOption: 0,
        isNative: 0n,
        delegatedAmount: 0n,
        closeAuthorityOption: 0,
        closeAuthority: PublicKey.default
      },
      data
    )
    jest
      .mocked(globalFetch)
      .mockResolvedValue({ serviceableEpoch: new BN(7) } as Awaited<
        ReturnType<typeof globalFetch>
      >)
    jest.spyOn(program.account.globalConfig, "fetch").mockResolvedValue({
      featureFlags: 6,
      minUnstakeRequest: new BN(10)
    } as WithdrawalConfigFixture)
    jest
      .spyOn(program.provider.connection, "getTokenAccountsByOwner")
      .mockResolvedValue({
        context: { slot: 1 },
        value: [
          {
            pubkey: getAssociatedTokenAddressSync(
              mint,
              user,
              false,
              TOKEN_2022_PROGRAM_ID
            ),
            account: {
              data,
              owner: TOKEN_2022_PROGRAM_ID,
              executable: false,
              lamports: 1,
              rentEpoch: 0
            }
          }
        ]
      })
    jest
      .spyOn(program.account.liqReceiptData, "fetchMultiple")
      .mockResolvedValue([
        {
          receiptId: new BN("9007199254740993"),
          liqports: new BN(100),
          epoch: new BN(8),
          fulfilled: false
        }
      ] as Awaited<ReturnType<typeof _receiptFetch>>)
    expect((await client.read(user)).receipts[0]).toEqual({
      mint: mint.toBase58(),
      amount: 100n,
      epoch: 8n,
      claimable: false
    })
    jest
      .mocked(globalFetch)
      .mockResolvedValue({ serviceableEpoch: new BN(8) } as Awaited<
        ReturnType<typeof globalFetch>
      >)
    expect((await client.read(user)).receipts[0].claimable).toBe(true)
    jest.mocked(program.account.globalConfig.fetch).mockResolvedValue({
      featureFlags: 2,
      minUnstakeRequest: new BN(10)
    } as WithdrawalConfigFixture)
    expect((await client.read(user)).receipts[0].claimable).toBe(false)
  })
})
