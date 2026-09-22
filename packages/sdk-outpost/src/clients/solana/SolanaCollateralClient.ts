import { BN, type AnchorProvider, type Program } from "@coral-xyz/anchor"
import {
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction
} from "@solana/web3.js"
import type { LiqsolCore } from "@wireio/outpost-solana-artifacts"
import {
  assertOperatorCollateralRequest,
  type OperatorCollateralRequest,
  type OperatorCollateralSubmission,
  type OperatorCollateralSubmissionOptions
} from "../../collateral/index.js"

const Seeds = {
    config: "outpost_config",
    registry: "operator_registry",
    outbound: "outbound_message_buffer",
    vault: "outpost_vault",
    position: "collateral_position"
  } as const,
  TokenCodeBytes = 8,
  Commitment = "confirmed"

/** Native operator collateral, deliberately separate from liquid-staking withdrawals. */
export class SolanaCollateralClient {
  /** Bind to the program created from the verified producer artifact suite. */
  constructor(
    private readonly provider: AnchorProvider,
    private readonly program: Program<LiqsolCore>
  ) {}

  /** No public operator collateral withdrawal instruction exists in this suite. */
  readonly capabilities = Object.freeze({
    nativeDeposit: true,
    nativeWithdrawal: false
  })

  /** Build the producer-defined native deposit instruction without exposing PDA work to consumers. */
  async createNativeDepositInstruction(
    request: OperatorCollateralRequest
  ): Promise<TransactionInstruction> {
    assertOperatorCollateralRequest(request)
    const depositor = this.provider.wallet.publicKey
    if (!depositor)
      throw new Error("Operator collateral requires a connected Solana wallet.")
    const tokenCode = new BN(request.tokenCode.toString()),
      derive = (seeds: Buffer[]) =>
        PublicKey.findProgramAddressSync(seeds, this.program.programId)[0]
    return this.program.methods
      .deposit(
        request.operatorType,
        tokenCode,
        new BN(request.amount.toString())
      )
      .accounts({
        depositor,
        config: derive([Buffer.from(Seeds.config)]),
        operatorRegistry: derive([Buffer.from(Seeds.registry)]),
        outboundMessageBuffer: derive([Buffer.from(Seeds.outbound)]),
        vault: derive([Buffer.from(Seeds.vault)]),
        collateralPosition: derive([
          Buffer.from(Seeds.position),
          depositor.toBuffer(),
          tokenCode.toArrayLike(Buffer, "le", TokenCodeBytes)
        ]),
        systemProgram: SystemProgram.programId
      })
      .instruction()
  }

  /** Submit native custody and retain its signature before confirmation. Depot acceptance is separate. */
  async depositNative(
    request: OperatorCollateralRequest,
    options: OperatorCollateralSubmissionOptions = {}
  ): Promise<OperatorCollateralSubmission> {
    const instruction = await this.createNativeDepositInstruction(request),
      latest = await this.provider.connection.getLatestBlockhash(Commitment),
      transaction = new Transaction({
        ...latest,
        feePayer: this.provider.wallet.publicKey
      }).add(instruction),
      signed = await this.provider.wallet.signTransaction(transaction),
      transactionId = await this.provider.connection.sendRawTransaction(
        signed.serialize(),
        { preflightCommitment: Commitment }
      ),
      submission = { transactionId }
    options.onSubmitted?.(submission)
    const confirmation = await this.provider.connection.confirmTransaction(
      { ...latest, signature: transactionId },
      Commitment
    )
    if (confirmation.value.err)
      throw new Error(
        `Solana collateral submission failed: ${JSON.stringify(confirmation.value.err)}`
      )
    return submission
  }
}
