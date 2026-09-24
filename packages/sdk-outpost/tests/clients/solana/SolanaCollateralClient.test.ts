import { Program, BorshInstructionCoder } from "@coral-xyz/anchor"
import {
  liqsolCoreIdl,
  type LiqsolCore
} from "@wireio/outpost-solana-artifacts"
import { SystemContracts } from "@wireio/sdk-core"
import { SolanaCollateralClient } from "@wireio/sdk-outpost"
import { PublicKey, SystemProgram, type SignatureStatus } from "@solana/web3.js"
import {
  createOutpostDeploymentProfileFixture,
  createSolanaProviderFixture
} from "../../Fixtures.js"

const SubmittedSignature = "4".repeat(64),
  LastValidBlockHeight = 99,
  ConfirmationTimeoutMs = 120_000,
  ConfirmationPollIntervalMs = 1_000,
  ConfirmationStatus = {
    processed: "processed",
    confirmed: "confirmed",
    finalized: "finalized"
  } as const,
  Request = {
    operatorType: SystemContracts.SysioOpregOperatortype.OPERATOR_TYPE_BATCH,
    tokenCode: 1n,
    amount: 1n,
    depotBalance: 0n
  }

/** Generated Anchor instruction's decoded payload used by the custody assertion. */
interface DecodedCollateralArguments {
  /** Native lamports as declared by the generated deposit method. */
  amount: Parameters<Program<LiqsolCore>["methods"]["deposit"]>[2]
}

/** Create a signed local transaction fixture; every network operation is mocked. */
function createCollateralFixture() {
  const profile = createOutpostDeploymentProfileFixture(),
    provider = createSolanaProviderFixture(profile),
    program = new Program<LiqsolCore>(
      { ...liqsolCoreIdl, address: profile.solana.programs.liqsolCore.address },
      provider
    ),
    client = new SolanaCollateralClient(provider, program),
    send = jest
      .spyOn(provider.connection, "sendRawTransaction")
      .mockResolvedValue(SubmittedSignature),
    status = jest.spyOn(provider.connection, "getSignatureStatuses"),
    height = jest
      .spyOn(provider.connection, "getBlockHeight")
      .mockResolvedValue(LastValidBlockHeight),
    websocket = jest.spyOn(provider.connection, "onSignature"),
    onSubmitted = jest.fn(() => expect(status).not.toHaveBeenCalled())
  jest.spyOn(provider.connection, "getLatestBlockhash").mockResolvedValue({
    blockhash: "1".repeat(32),
    lastValidBlockHeight: LastValidBlockHeight
  })
  return {
    provider,
    program,
    client,
    send,
    status,
    height,
    websocket,
    onSubmitted
  }
}

/** Construct typed RPC evidence without reaching a running validator. */
function createStatus(
  confirmationStatus: SignatureStatus["confirmationStatus"]
): SignatureStatus {
  return { slot: 1, confirmations: 1, confirmationStatus, err: null }
}

describe("SolanaCollateralClient", () => {
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it.each([ConfirmationStatus.confirmed, ConfirmationStatus.finalized])(
    "accepts %s HTTP evidence without a WebSocket or duplicate send",
    async confirmationStatus => {
      jest.useFakeTimers()
      const { client, status, height, send, websocket, onSubmitted } =
        createCollateralFixture()
      status.mockResolvedValue({
        context: { slot: 1 },
        value: [createStatus(confirmationStatus)]
      })
      // A recorded signature remains valid after its submission blockhash expires.
      height.mockResolvedValue(LastValidBlockHeight + 1)
      await expect(
        client.depositNative(Request, { onSubmitted })
      ).resolves.toEqual({ transactionId: SubmittedSignature })
      expect(onSubmitted).toHaveBeenCalledWith({
        transactionId: SubmittedSignature
      })
      expect(send).toHaveBeenCalledTimes(1)
      expect(websocket).not.toHaveBeenCalled()
      expect(jest.getTimerCount()).toBe(0)
    }
  )

  it("waits for a processed signature to confirm without rebroadcasting", async () => {
    jest.useFakeTimers()
    const { client, status, send, onSubmitted } = createCollateralFixture()
    status
      .mockResolvedValueOnce({
        context: { slot: 1 },
        value: [createStatus(ConfirmationStatus.processed)]
      })
      .mockResolvedValue({
        context: { slot: 2 },
        value: [createStatus(ConfirmationStatus.confirmed)]
      })
    const result = client.depositNative(Request, { onSubmitted })
    await jest.advanceTimersByTimeAsync(ConfirmationPollIntervalMs)
    await expect(result).resolves.toEqual({ transactionId: SubmittedSignature })
    expect(status).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenCalledTimes(1)
    expect(onSubmitted).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })

  it("preserves the signature on instruction error and expiry", async () => {
    const { client, status, height, onSubmitted, send } =
      createCollateralFixture()
    status.mockResolvedValue({
      context: { slot: 1 },
      value: [
        {
          ...createStatus(ConfirmationStatus.processed),
          err: { InstructionError: [0, "InvalidArgument"] }
        }
      ]
    })
    await expect(
      client.depositNative(Request, { onSubmitted })
    ).rejects.toThrow("InvalidArgument")
    expect(onSubmitted).toHaveBeenCalledWith({
      transactionId: SubmittedSignature
    })
    status
      .mockClear()
      .mockResolvedValue({ context: { slot: 1 }, value: [null] })
    height.mockResolvedValue(LastValidBlockHeight + 1)
    await expect(
      client.depositNative(Request, { onSubmitted })
    ).rejects.toThrow("blockhash expired")
    expect(onSubmitted).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it("propagates an RPC error after saving the signature and clears its timeout", async () => {
    jest.useFakeTimers()
    const { client, status, send, onSubmitted } = createCollateralFixture(),
      error = new Error("RPC unavailable")
    status.mockRejectedValue(error)
    await expect(client.depositNative(Request, { onSubmitted })).rejects.toBe(
      error
    )
    expect(onSubmitted).toHaveBeenCalledWith({
      transactionId: SubmittedSignature
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })

  it("bounds a stalled HTTP call and stops polling after timeout", async () => {
    jest.useFakeTimers()
    const { client, status, send, onSubmitted } = createCollateralFixture()
    status.mockImplementation(() => new Promise(() => {}))
    const result = expect(
      client.depositNative(Request, { onSubmitted })
    ).rejects.toThrow("timed out")
    await jest.advanceTimersByTimeAsync(ConfirmationTimeoutMs)
    await result
    expect(onSubmitted).toHaveBeenCalledWith({
      transactionId: SubmittedSignature
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(status).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })

  it("stops polling a pending signature at the deadline without a duplicate deposit", async () => {
    jest.useFakeTimers()
    const { client, status, send, onSubmitted } = createCollateralFixture()
    status.mockResolvedValue({
      context: { slot: 1 },
      value: [createStatus(ConfirmationStatus.processed)]
    })
    const result = expect(
      client.depositNative(Request, { onSubmitted })
    ).rejects.toThrow("timed out")
    await jest.advanceTimersByTimeAsync(ConfirmationTimeoutMs)
    await result
    const reads = status.mock.calls.length
    await jest.advanceTimersByTimeAsync(ConfirmationPollIntervalMs)
    expect(status).toHaveBeenCalledTimes(reads)
    expect(send).toHaveBeenCalledTimes(1)
    expect(onSubmitted).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })

  it("does not report submission when the wallet rejects signing", async () => {
    const { client, provider, send, onSubmitted } = createCollateralFixture()
    jest
      .spyOn(provider.wallet, "signTransaction")
      .mockRejectedValue(new Error("Wallet declined"))
    await expect(
      client.depositNative(Request, { onSubmitted })
    ).rejects.toThrow("Wallet declined")
    expect(send).not.toHaveBeenCalled()
    expect(onSubmitted).not.toHaveBeenCalled()
  })

  it("encodes exact lamports with the producer-defined custody accounts and no withdrawal capability", async () => {
    const { client, provider, program } = createCollateralFixture(),
      amount = 9_007_199_254_740_993n,
      instruction = await client.createNativeDepositInstruction({
        operatorType:
          SystemContracts.SysioOpregOperatortype.OPERATOR_TYPE_UNDERWRITER,
        tokenCode: 1n,
        amount,
        depotBalance: 0n
      }),
      position = PublicKey.findProgramAddressSync(
        [
          Buffer.from("collateral_position"),
          provider.wallet.publicKey.toBuffer(),
          Buffer.from([1, 0, 0, 0, 0, 0, 0, 0])
        ],
        program.programId
      )[0],
      decoded = new BorshInstructionCoder(liqsolCoreIdl).decode(
        instruction.data
      )!,
      sharedSeeds = [
        "outpost_config",
        "operator_registry",
        "outbound_message_buffer",
        "outpost_vault"
      ]
    sharedSeeds.forEach(seed => {
      const address = PublicKey.findProgramAddressSync(
        [Buffer.from(seed)],
        program.programId
      )[0]
      expect(instruction.keys.some(key => key.pubkey.equals(address))).toBe(
        true
      )
    })
    expect(decoded.name).toBe("deposit")
    expect((decoded.data as DecodedCollateralArguments).amount.toString()).toBe(
      amount.toString()
    )
    expect(
      instruction.keys.some(
        key => key.pubkey.equals(position) && key.isWritable
      )
    ).toBe(true)
    expect(
      instruction.keys.some(
        key => key.pubkey.equals(provider.wallet.publicKey) && key.isSigner
      )
    ).toBe(true)
    expect(
      instruction.keys.some(key => key.pubkey.equals(SystemProgram.programId))
    ).toBe(true)
    expect(client.capabilities).toEqual({
      nativeDeposit: true,
      nativeWithdrawal: false
    })
    expect("requestNativeWithdrawal" in client).toBe(false)
  })
})
