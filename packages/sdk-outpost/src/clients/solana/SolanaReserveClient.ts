import {
  type AnchorProvider,
  type IdlAccounts,
  type Program
} from "@coral-xyz/anchor"
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID
} from "@solana/spl-token"
import {
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  type TransactionInstruction
} from "@solana/web3.js"
import { match } from "ts-pattern"

import type { LiqsolCore } from "../../programs/solana/index.js"
import {
  assertReserveCreateDefinition,
  assertReserveUnsigned64,
  OutpostReserveStatus,
  type OutpostReserveIdentity,
  type OutpostReserveSubmission,
  type SolanaConfiguredReserveToken,
  type SolanaReserveCreateRequest,
  type SolanaReserveRecord
} from "../../reserves/index.js"
import { SolanaReserveAddresses } from "./SolanaReserveAddresses.js"

const PublicKeyByteLength = 32,
  NativeSolanaDecimals = 9

type LiqsolCoreAccounts = IdlAccounts<LiqsolCore>

/** Reserve creation, cancellation, and reads for one verified Solana outpost. */
export class SolanaReserveClient {
  private readonly addresses: SolanaReserveAddresses

  /** Bind reserve lifecycle operations to a generated Anchor program client. */
  constructor(
    private readonly provider: AnchorProvider,
    private readonly program: Program<LiqsolCore>
  ) {
    this.addresses = new SolanaReserveAddresses(program.programId)
  }

  /** List token routes configured by the deployed outpost. */
  async getConfiguredTokens(): Promise<SolanaConfiguredReserveToken[]> {
    const account = await this.provider.connection.getAccountInfo(
      this.addresses.outpostConfig()
    )
    if (account == null) {
      throw new Error("Solana outpost configuration is unavailable.")
    }
    const config = this.program.coder.accounts.decode<
        LiqsolCoreAccounts["outpostConfig"]
      >("outpostConfig", account.data),
      precisionByTokenCode = new Map(
        config.precisionByTokenCode.map(entry => [
          entry.tokenCode.toString(),
          entry.decimals
        ])
      ),
      nativeTokenMarker = new PublicKey(
        new Uint8Array(PublicKeyByteLength)
      )

    return config.tokenAddressesByCode.map(entry => {
      const tokenCode = entry.tokenCode.toString(),
        isNative = entry.mint.equals(nativeTokenMarker),
        configuredDecimals = precisionByTokenCode.get(tokenCode)
      if (!isNative && configuredDecimals == null) {
        throw new Error(
          `Solana reserve token ${tokenCode} has no configured precision.`
        )
      }
      return {
        tokenCode: BigInt(tokenCode),
        mint: entry.mint,
        isNative,
        decimals: isNative ? NativeSolanaDecimals : configuredDecimals
      }
    })
  }

  /** Derive the local outpost account for one reserve identity. */
  deriveAddress(identity: OutpostReserveIdentity): PublicKey {
    return this.addresses.reserve(identity)
  }

  /** Build reserve-creation instructions without signing or submitting. */
  async createInstructions(
    request: SolanaReserveCreateRequest
  ): Promise<TransactionInstruction[]> {
    assertReserveCreateDefinition(request)
    assertReserveUnsigned64(request.externalTokenAmount, "externalTokenAmount")
    const creator = this.assertWallet(),
      {
        creatorTokenAccount = getAssociatedTokenAddressSync(
          request.mint,
          creator,
          false,
          TOKEN_PROGRAM_ID
        )
      } = request,
      createReserve = await this.program.methods
        .createReserve(
          this.addresses.unsigned64(request.tokenCode, "tokenCode"),
          this.addresses.unsigned64(request.reserveCode, "reserveCode"),
          this.addresses.unsigned64(
            request.externalTokenAmount,
            "externalTokenAmount"
          ),
          this.addresses.unsigned64(
            request.requestedWireAmount,
            "requestedWireAmount"
          ),
          request.connectorWeightBps,
          request.name,
          request.description,
          request.isPrivate
        )
        .accounts({
          creator,
          config: this.addresses.outpostConfig(),
          reserve: this.addresses.reserve(request),
          reserveVault: this.addresses.reserveVault(request),
          mint: request.mint,
          creatorAta: creatorTokenAccount,
          outboundMessageBuffer: this.addresses.outboundMessageBuffer(),
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY
        })
        .instruction()

    if (
      request.ensureCreatorTokenAccount === false ||
      request.creatorTokenAccount != null
    ) {
      return [createReserve]
    }

    return [
      createAssociatedTokenAccountIdempotentInstruction(
        creator,
        creatorTokenAccount,
        creator,
        request.mint,
        TOKEN_PROGRAM_ID
      ),
      createReserve
    ]
  }

  /** Create a pending external reserve. */
  async create(
    request: SolanaReserveCreateRequest
  ): Promise<OutpostReserveSubmission> {
    const transactionId = await this.provider.sendAndConfirm(
      new Transaction().add(...(await this.createInstructions(request)))
    )
    return { transactionId }
  }

  /** Build a creator-authorized pending-reserve cancellation instruction. */
  async cancelInstruction(
    identity: OutpostReserveIdentity
  ): Promise<TransactionInstruction> {
    const creator = this.assertWallet()
    return this.program.methods
      .cancelCreateReserve(
        this.addresses.unsigned64(identity.tokenCode, "tokenCode"),
        this.addresses.unsigned64(identity.reserveCode, "reserveCode")
      )
      .accounts({
        creator,
        config: this.addresses.outpostConfig(),
        reserve: this.addresses.reserve(identity),
        outboundMessageBuffer: this.addresses.outboundMessageBuffer()
      })
      .instruction()
  }

  /** Request cancellation and refund of a pending reserve. */
  async cancel(
    identity: OutpostReserveIdentity
  ): Promise<OutpostReserveSubmission> {
    const transactionId = await this.provider.sendAndConfirm(
      new Transaction().add(await this.cancelInstruction(identity))
    )
    return { transactionId }
  }

  /** Read and normalize one local reserve account. */
  async get(
    identity: OutpostReserveIdentity
  ): Promise<SolanaReserveRecord> {
    const address = this.addresses.reserve(identity),
      account = await this.provider.connection.getAccountInfo(address)
    if (account == null) return null
    const reserve = this.program.coder.accounts.decode<
      LiqsolCoreAccounts["reserve"]
    >("reserve", account.data)

    return {
      address,
      vaultAddress: this.addresses.reserveVault(identity),
      tokenCode: BigInt(reserve.tokenCode.toString()),
      reserveCode: BigInt(reserve.reserveCode.toString()),
      externalTokenAmount: BigInt(reserve.externalTokenAmount.toString()),
      requestedWireAmount: BigInt(reserve.requestedWireAmount.toString()),
      connectorWeightBps: reserve.connectorWeightBps,
      status: match(reserve.status)
        .when(
          status => "pending" in status,
          () => OutpostReserveStatus.pending
        )
        .when(
          status => "active" in status,
          () => OutpostReserveStatus.active
        )
        .when(
          status => "cancelled" in status,
          () => OutpostReserveStatus.cancelled
        )
        .otherwise(() => {
          throw new Error("Unsupported Solana reserve status.")
        }),
      creator: reserve.creator,
      name: this.decodeFixedUtf8(reserve.nameBytes, reserve.nameLen),
      description: this.decodeFixedUtf8(
        reserve.descriptionBytes,
        reserve.descriptionLen
      )
    }
  }

  private assertWallet(): PublicKey {
    const publicKey = this.provider.wallet.publicKey
    if (publicKey == null) {
      throw new Error("Solana reserve operation requires a connected wallet.")
    }
    return publicKey
  }

  private decodeFixedUtf8(value: ArrayLike<number>, length: number): string {
    return new TextDecoder().decode(
      Uint8Array.from(value).slice(0, Number(length))
    )
  }
}
