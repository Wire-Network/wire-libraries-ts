import { BN, type AnchorProvider, type Program } from "@coral-xyz/anchor"
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID
} from "@solana/spl-token"
import {
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
  type VersionedTransactionResponse
} from "@solana/web3.js"
import { utils as ethersUtils } from "ethers"

import type { LiqsolCore } from "../../programs/solana/index.js"
import {
  assertReserveSwapRequest,
  assertReserveUnsigned64,
  type ReserveSwapRequest,
  type ReserveSwapSubmission,
  type SolanaSplReserveSwapRequest
} from "../../reserves/index.js"

const ConfirmationCommitment = "confirmed",
  ConfirmationPollIntervalMs = 1_500,
  SolanaConfirmationStatus = {
    confirmed: "confirmed",
    finalized: "finalized"
  } as const,
  OutpostConfigSeed = Buffer.from("outpost_config"),
  ReserveSeed = Buffer.from("reserve"),
  ReserveVaultSeed = Buffer.from("reserve_vault"),
  OutboundMessageBufferSeed = Buffer.from("outbound_message_buffer"),
  Unsigned64ByteLength = 8,
  SwapDepositLog = /opp_outpost: SwapDeposit id=(\d+)\b/

/** Reserve-swap writes and balance reads for one verified Solana outpost. */
export class SolanaReserveSwapClient {
  /** Create a Solana reserve-swap workflow bound to a verified deployment. */
  constructor(
    private readonly provider: AnchorProvider,
    private readonly program: Program<LiqsolCore>
  ) {}

  /** Build a native-SOL reserve-swap instruction without signing it. */
  async createNativeInstruction(
    request: ReserveSwapRequest
  ): Promise<TransactionInstruction> {
    assertReserveSwapRequest(request)
    const user = this.assertWallet()
    return this.program.methods
      .requestSwap(...this.instructionArguments(request))
      .accounts({
        user,
        config: this.deriveAddress([OutpostConfigSeed]),
        reserve: this.deriveReserveAddress(ReserveSeed, request),
        outboundMessageBuffer: this.deriveAddress([
          OutboundMessageBufferSeed
        ]),
        systemProgram: SystemProgram.programId
      })
      .instruction()
  }

  /** Escrow native SOL and return the confirmed protocol deposit id. */
  async requestNative(
    request: ReserveSwapRequest
  ): Promise<ReserveSwapSubmission> {
    return this.submit(await this.createNativeInstruction(request))
  }

  /** Build a classic SPL reserve-swap instruction without signing it. */
  async createSplInstruction(
    request: SolanaSplReserveSwapRequest
  ): Promise<TransactionInstruction> {
    assertReserveSwapRequest(request)
    const user = this.assertWallet(),
      {
        userTokenAccount = getAssociatedTokenAddressSync(
          request.mint,
          user,
          false,
          TOKEN_PROGRAM_ID
        )
      } = request

    return this.program.methods
      .requestSwapSpl(...this.instructionArguments(request))
      .accounts({
        user,
        config: this.deriveAddress([OutpostConfigSeed]),
        reserve: this.deriveReserveAddress(ReserveSeed, request),
        reserveVault: this.deriveReserveAddress(ReserveVaultSeed, request),
        mint: request.mint,
        userAta: userTokenAccount,
        outboundMessageBuffer: this.deriveAddress([
          OutboundMessageBufferSeed
        ]),
        tokenProgram: TOKEN_PROGRAM_ID
      })
      .instruction()
  }

  /** Escrow a classic SPL token and return the confirmed protocol deposit id. */
  async requestSpl(
    request: SolanaSplReserveSwapRequest
  ): Promise<ReserveSwapSubmission> {
    return this.submit(await this.createSplInstruction(request))
  }

  /** Read the native SOL balance of one account. */
  async nativeBalance(owner = this.assertWallet()): Promise<bigint> {
    return BigInt(
      await this.provider.connection.getBalance(
        owner,
        ConfirmationCommitment
      )
    )
  }

  /** Read a classic SPL token balance, returning zero when the ATA is absent. */
  async splBalance(
    mint: PublicKey,
    owner = this.assertWallet()
  ): Promise<bigint> {
    const tokenAccount = getAssociatedTokenAddressSync(
        mint,
        owner,
        false,
        TOKEN_PROGRAM_ID
      ),
      account = await this.provider.connection.getAccountInfo(
        tokenAccount,
        ConfirmationCommitment
      )
    if (account == null) return 0n
    const balance = await this.provider.connection.getTokenAccountBalance(
      tokenAccount,
      ConfirmationCommitment
    )
    return BigInt(balance.value.amount)
  }

  private assertWallet(): PublicKey {
    const publicKey = this.provider.wallet.publicKey
    if (publicKey == null) {
      throw new Error("Solana reserve swap requires a connected wallet.")
    }
    return publicKey
  }

  private deriveAddress(seeds: Buffer[]): PublicKey {
    return PublicKey.findProgramAddressSync(seeds, this.program.programId)[0]
  }

  private deriveReserveAddress(
    seed: Buffer,
    request: ReserveSwapRequest
  ): PublicKey {
    return this.deriveAddress([
      seed,
      this.unsigned64Seed(request.sourceTokenCode, "sourceTokenCode"),
      this.unsigned64Seed(request.sourceReserveCode, "sourceReserveCode")
    ])
  }

  private unsigned64Seed(
    value: ReserveSwapRequest["sourceTokenCode"],
    field: string
  ): Buffer {
    return new BN(assertReserveUnsigned64(value, field).toString()).toArrayLike(
      Buffer,
      "le",
      Unsigned64ByteLength
    )
  }

  private instructionArguments(request: ReserveSwapRequest) {
    return [
      this.unsigned64(request.sourceTokenCode, "sourceTokenCode"),
      this.unsigned64(request.sourceReserveCode, "sourceReserveCode"),
      this.unsigned64(request.sourceAmount, "sourceAmount"),
      this.unsigned64(request.targetChainCode, "targetChainCode"),
      this.unsigned64(request.targetTokenCode, "targetTokenCode"),
      this.unsigned64(request.targetReserveCode, "targetReserveCode"),
      Buffer.from(ethersUtils.arrayify(request.targetRecipient)),
      this.unsigned64(request.targetAmount, "targetAmount"),
      request.targetToleranceBps
    ] as const
  }

  private unsigned64(
    value: ReserveSwapRequest["sourceTokenCode"],
    field: string
  ): BN {
    return new BN(assertReserveUnsigned64(value, field).toString())
  }

  private async submit(
    instruction: TransactionInstruction
  ): Promise<ReserveSwapSubmission> {
    const connection = this.provider.connection,
      latestBlockhash = await connection.getLatestBlockhash(
        ConfirmationCommitment
      ),
      transaction = new Transaction({
        feePayer: this.assertWallet(),
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      }).add(instruction),
      signedTransaction = await this.provider.wallet.signTransaction(
        transaction
      ),
      transactionId = await connection.sendRawTransaction(
        signedTransaction.serialize(),
        { preflightCommitment: ConfirmationCommitment }
      ),
      confirmedTransaction = await this.waitForConfirmedTransaction(
        transactionId,
        latestBlockhash.lastValidBlockHeight
      ),
      sourceRequestId = SolanaReserveSwapClient.parseSourceRequestId(
        confirmedTransaction.meta?.logMessages ?? []
      )
    return { transactionId, sourceRequestId }
  }

  /** Poll one submitted signature until Solana records success or a terminal error. */
  private async waitForConfirmedTransaction(
    transactionId: string,
    lastValidBlockHeight: number
  ): Promise<VersionedTransactionResponse> {
    const connection = this.provider.connection,
      [statusResponse, blockHeight] = await Promise.all([
        connection.getSignatureStatuses([transactionId], {
          searchTransactionHistory: true
        }),
        connection.getBlockHeight(ConfirmationCommitment)
      ]),
      status = statusResponse.value[0]

    if (status?.err != null) {
      throw new Error(
        `Solana reserve swap ${transactionId} failed: ${JSON.stringify(status.err)}`
      )
    }

    const confirmed =
      status?.confirmationStatus === SolanaConfirmationStatus.confirmed ||
      status?.confirmationStatus === SolanaConfirmationStatus.finalized
    if (confirmed) {
      const confirmedTransaction = await connection.getTransaction(
        transactionId,
        {
          commitment: ConfirmationCommitment,
          maxSupportedTransactionVersion: 0
        }
      )
      if (confirmedTransaction != null) return confirmedTransaction
    } else if (status == null && blockHeight > lastValidBlockHeight) {
      throw new Error(
        `Solana reserve swap ${transactionId} expired before it was recorded on chain.`
      )
    }

    await new Promise(resolve => setTimeout(resolve, ConfirmationPollIntervalMs))
    return this.waitForConfirmedTransaction(
      transactionId,
      lastValidBlockHeight
    )
  }

  /** Parse the canonical deposit id logged by `request_swap*`. */
  static parseSourceRequestId(logMessages: readonly string[]): bigint {
    const match = logMessages
      .map(message => message.match(SwapDepositLog))
      .find(candidate => candidate != null)
    if (match == null) {
      throw new Error("Confirmed Solana reserve swap did not log SwapDeposit.")
    }
    return BigInt(match[1])
  }
}
