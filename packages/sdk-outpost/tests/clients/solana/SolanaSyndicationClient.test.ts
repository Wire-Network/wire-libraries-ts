import { AnchorProvider, BorshInstructionCoder, Program, Wallet } from "@coral-xyz/anchor"
import { Connection, Keypair, PublicKey, StakeProgram } from "@solana/web3.js"
import { liqsolCoreIdl, type LiqsolCore } from "@wireio/outpost-solana-artifacts"
import {
  SolanaSyndicationClient,
  type SolanaSyndicationState
} from "@wireio/sdk-outpost"

/** Build real producer-IDL instructions against an in-memory readiness fixture. */
function fixture() {
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
  jest.spyOn(client, "read").mockImplementation(async () => state)
  return { client, program, user: wallet.publicKey, state }
}

describe("Solana syndication", () => {
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
    expect(new BorshInstructionCoder(program.idl).decode(instruction.data)?.name).toBe(
      "synd"
    )
    expect(
      instruction.keys.some(key =>
        key.pubkey.equals(addresses.outboundMessageBuffer)
      )
    ).toBe(true)
    expect(transaction.signatures).toEqual([])
  })
})
