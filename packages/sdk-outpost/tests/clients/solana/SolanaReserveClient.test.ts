import { BN, Program } from "@coral-xyz/anchor"
import { ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token"
import { Keypair, PublicKey } from "@solana/web3.js"

import {
  type LiqsolCore,
  OutpostReserveStatus,
  type SolanaReserveCreateRequest,
  SolanaReserveClient,
  liqsolCoreIdl
} from "@wireio/sdk-outpost"
import {
  createOutpostDeploymentProfileFixture,
  createSolanaProviderFixture
} from "../../Fixtures.js"

const SubmittedSignature = "4".repeat(64),
  AccountData = Buffer.alloc(8),
  NativeTokenMarker = new PublicKey(new Uint8Array(32))

const request: SolanaReserveCreateRequest = {
  tokenCode: 1,
  reserveCode: 2,
  externalTokenAmount: 3,
  requestedWireAmount: 4,
  connectorWeightBps: 5_000,
  name: "Private USDC reserve",
  description: "Same-owner external routing",
  isPrivate: true,
  mint: Keypair.generate().publicKey
}

function clientFixture() {
  const profile = createOutpostDeploymentProfileFixture(),
    provider = createSolanaProviderFixture(profile),
    address = profile.solana.programs.liqsolCore.address,
    program = new Program<LiqsolCore>(
      { ...liqsolCoreIdl, address },
      provider
    ),
    client = new SolanaReserveClient(provider, program)

  return { client, program, provider }
}

describe("SolanaReserveClient", () => {
  it("builds permissionless reserve creation with an idempotent creator ATA", async () => {
    const { client, program, provider } = clientFixture(),
      instructions = await client.createInstructions(request)

    expect(instructions).toHaveLength(2)
    expect(
      instructions[0].programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)
    ).toBe(true)
    expect(instructions[1].programId.equals(program.programId)).toBe(true)
    expect(
      instructions[1].keys.some(key =>
        key.pubkey.equals(provider.wallet.publicKey)
      )
    ).toBe(true)
  })

  it("uses an explicit creator token account without adding an ATA instruction", async () => {
    const { client } = clientFixture(),
      instructions = await client.createInstructions({
        ...request,
        creatorTokenAccount: Keypair.generate().publicKey
      })

    expect(instructions).toHaveLength(1)
  })

  it("submits reserve creation and pending cancellation through the provider", async () => {
    const { client, provider } = clientFixture(),
      sendAndConfirm = jest
        .spyOn(provider, "sendAndConfirm")
        .mockResolvedValue(SubmittedSignature)

    await expect(client.create(request)).resolves.toEqual({
      transactionId: SubmittedSignature
    })
    await expect(
      client.cancel({ tokenCode: 1, reserveCode: 2 })
    ).resolves.toEqual({ transactionId: SubmittedSignature })
    expect(sendAndConfirm).toHaveBeenCalledTimes(2)
  })

  it("normalizes configured token routes and a local reserve record", async () => {
    const { client, program, provider } = clientFixture(),
      splMint = Keypair.generate().publicKey,
      creator = Keypair.generate().publicKey

    jest.spyOn(provider.connection, "getAccountInfo").mockResolvedValue({
      data: AccountData,
      executable: false,
      lamports: 1,
      owner: program.programId,
      rentEpoch: 0
    })
    jest
      .spyOn(program.coder.accounts, "decode")
      .mockImplementation(accountName =>
        (accountName === "outpostConfig"
          ? {
              tokenAddressesByCode: [
                { tokenCode: new BN(1), mint: NativeTokenMarker },
                { tokenCode: new BN(2), mint: splMint }
              ],
              precisionByTokenCode: [
                { tokenCode: new BN(2), decimals: 6 }
              ]
            }
          : {
              tokenCode: new BN(2),
              reserveCode: new BN(3),
              externalTokenAmount: new BN(4),
              requestedWireAmount: new BN(5),
              connectorWeightBps: 5_000,
              status: { active: {} },
              creator,
              nameLen: 4,
              nameBytes: [...Buffer.from("USDC"), ...new Uint8Array(60)],
              descriptionLen: 7,
              descriptionBytes: [
                ...Buffer.from("Private"),
                ...new Uint8Array(249)
              ]
            }) as never
      )

    await expect(client.getConfiguredTokens()).resolves.toEqual([
      {
        tokenCode: 1n,
        mint: NativeTokenMarker,
        isNative: true,
        decimals: 9
      },
      { tokenCode: 2n, mint: splMint, isNative: false, decimals: 6 }
    ])
    await expect(
      client.get({ tokenCode: 2, reserveCode: 3 })
    ).resolves.toEqual(
      expect.objectContaining({
        tokenCode: 2n,
        reserveCode: 3n,
        status: OutpostReserveStatus.active,
        creator,
        name: "USDC",
        description: "Private"
      })
    )
  })

  it("returns null for an absent account and rejects invalid creation values", async () => {
    const { client, provider } = clientFixture()
    jest.spyOn(provider.connection, "getAccountInfo").mockResolvedValue(null)

    await expect(
      client.get({ tokenCode: 1, reserveCode: 2 })
    ).resolves.toBeNull()
    await expect(
      client.createInstructions({ ...request, externalTokenAmount: 0 })
    ).rejects.toThrow("externalTokenAmount must be greater than zero.")
    await expect(
      client.createInstructions({ ...request, mint: NativeTokenMarker })
    ).rejects.toThrow("requires a real placeholder SPL mint")
  })

  it("rejects a configured SPL reserve route without chain precision", async () => {
    const { client, program, provider } = clientFixture(),
      splMint = Keypair.generate().publicKey
    jest.spyOn(provider.connection, "getAccountInfo").mockResolvedValue({
      data: AccountData,
      executable: false,
      lamports: 1,
      owner: program.programId,
      rentEpoch: 0
    })
    jest.spyOn(program.coder.accounts, "decode").mockReturnValue({
      tokenAddressesByCode: [{ tokenCode: new BN(2), mint: splMint }],
      precisionByTokenCode: []
    } as never)

    await expect(client.getConfiguredTokens()).rejects.toThrow(
      "Solana reserve token 2 has no configured precision."
    )
  })
})
