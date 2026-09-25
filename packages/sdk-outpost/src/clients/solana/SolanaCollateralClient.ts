import { BN, type AnchorProvider, type Program } from "@coral-xyz/anchor"
import {
  SystemProgram,
  Transaction,
  type TransactionInstruction
} from "@solana/web3.js"
import type { LiqsolCore } from "@wireio/outpost-solana-artifacts"
import {
  assertOperatorCollateralRequest,
  type OperatorCollateralCapabilities,
  type OperatorCollateralRequest,
  type OperatorCollateralSubmission,
  type OperatorCollateralSubmissionOptions
} from "../../collateral/index.js"

import {
  isSolanaTransactionConfirmed,
  SolanaConfirmationCommitment
} from "../../util/SolanaConfirmation.js"
import { SolanaCollateralAddresses } from "./SolanaCollateralAddresses.js"

const ConfirmationPollIntervalMs = 1_000,
  ConfirmationTimeoutMs = 120_000

/** Native operator collateral, deliberately separate from liquid-staking withdrawals. */
export class SolanaCollateralClient {
  private readonly addresses: SolanaCollateralAddresses

  /** Bind to the program created from the verified producer artifact suite. */
  constructor(
    private readonly provider: AnchorProvider,
    private readonly program: Program<LiqsolCore>
  ) {
    this.addresses = new SolanaCollateralAddresses(program.programId)
  }

  /** No public operator collateral withdrawal instruction exists in this suite. */
  readonly capabilities = Object.freeze({
    nativeDeposit: true,
    nativeWithdrawal: false
  } satisfies OperatorCollateralCapabilities)

  /** Build the producer-defined native deposit instruction without exposing PDA work to consumers. */
  async createNativeDepositInstruction(
    request: OperatorCollateralRequest
  ): Promise<TransactionInstruction> {
    assertOperatorCollateralRequest(request)
    const depositor = this.provider.wallet.publicKey
    if (!depositor)
      throw new Error("Operator collateral requires a connected Solana wallet.")
    const tokenCode = new BN(request.tokenCode.toString())
    return this.program.methods
      .deposit(
        request.operatorType,
        tokenCode,
        new BN(request.amount.toString())
      )
      .accounts({
        depositor,
        config: this.addresses.outpostConfig(),
        operatorRegistry: this.addresses.operatorRegistry(),
        outboundMessageBuffer: this.addresses.outboundMessageBuffer(),
        vault: this.addresses.vault(),
        collateralPosition: this.addresses.position(
          depositor,
          request.tokenCode
        ),
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
      latest = await this.provider.connection.getLatestBlockhash(
        SolanaConfirmationCommitment
      ),
      transaction = new Transaction({
        ...latest,
        feePayer: this.provider.wallet.publicKey
      }).add(instruction),
      signed = await this.provider.wallet.signTransaction(transaction),
      transactionId = await this.provider.connection.sendRawTransaction(
        signed.serialize(),
        { preflightCommitment: SolanaConfirmationCommitment }
      ),
      submission = { transactionId }
    options.onSubmitted?.(submission)
    await this.waitForConfirmation(transactionId, latest.lastValidBlockHeight)
    return submission
  }

  /** HTTP confirmation also works through RPC gateways without a WebSocket endpoint. */
  private async waitForConfirmation(
    transactionId: string,
    lastValidBlockHeight: number
  ): Promise<void> {
    const deadline = Date.now() + ConfirmationTimeoutMs,
      timeoutError = new Error(
        `Solana collateral confirmation timed out for ${transactionId}. Check the signature and depot before resubmitting.`
      )
    while (Date.now() < deadline) {
      let timer: ReturnType<typeof setTimeout>
      const confirmed = await Promise.race([
        isSolanaTransactionConfirmed(
          this.provider.connection,
          transactionId,
          lastValidBlockHeight
        ),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(timeoutError), deadline - Date.now())
        })
      ]).finally(() => clearTimeout(timer))
      if (confirmed) return
      await new Promise(resolve =>
        setTimeout(
          resolve,
          Math.min(
            ConfirmationPollIntervalMs,
            Math.max(0, deadline - Date.now())
          )
        )
      )
    }
    throw timeoutError
  }
}
