import {
  AnchorProvider,
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
import { SolanaSyndicationClient } from "@wireio/sdk-outpost/clients/solana/SolanaSyndicationClient"
import { SolanaWithdrawalClient } from "@wireio/sdk-outpost/clients/solana/SolanaWithdrawalClient"
import type { SolanaWithdrawalState } from "@wireio/sdk-outpost"

interface DecodedWithdrawalRequest {
  amount: BN
}

function fixture() {
  const user = Keypair.generate().publicKey,
    provider = new AnchorProvider(
      new Connection("https://example.invalid"),
      new Wallet(Keypair.generate()),
      {}
    ),
    program = new Program<LiqsolCore>(liqsolCoreIdl, provider),
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
      new BN("9007199254740993").toArrayLike(Buffer, "le", 8)
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
  it("builds the producer IDL request with an exact u64 receipt ID and user-owned receipt", async () => {
    const { client, user, program, syndication, mint, address } = fixture(),
      tx = await client.request(user, 900n),
      instruction = tx.instructions[1],
      decoded = new BorshInstructionCoder(liqsolCoreIdl).decode(
        instruction.data
      )
    expect(decoded?.name).toBe("requestWithdraw")
    expect((decoded?.data as DecodedWithdrawalRequest).amount.toString()).toBe(
      "900"
    )
    const names = liqsolCoreIdl.instructions
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

  it("refuses disabled, below-minimum, over-balance and overflowing requests", async () => {
    const { client, user, state } = fixture()
    for (const amount of [0n, 9n, 1001n, 1n << 64n])
      await expect(client.request(user, amount)).rejects.toThrow(/minimum/)
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
    } as Awaited<ReturnType<typeof _configFetch>>)
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
    } as Awaited<ReturnType<typeof _configFetch>>)
    expect((await client.read(user)).receipts[0].claimable).toBe(false)
  })
})
