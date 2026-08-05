import type { PublicKey } from "@solana/web3.js"
import type { BigNumberish, BytesLike } from "ethers"

/** Confirmed source-outpost submission used to correlate a swap with Wire. */
export interface ReserveSwapSubmission {
  /** External-chain transaction signature or hash. */
  transactionId: string
  /** Protocol deposit id copied into `sysio.uwrit::uwreqs.source_tx_id`. */
  sourceRequestId: bigint
}

/** Reserve-swap request shared by Ethereum and Solana outposts. */
export interface ReserveSwapRequest {
  /** Packed source token slug. */
  sourceTokenCode: BigNumberish
  /** Packed source reserve discriminator. */
  sourceReserveCode: BigNumberish
  /** Escrowed source amount in external-chain base units. */
  sourceAmount: BigNumberish
  /** Packed destination chain slug. */
  targetChainCode: BigNumberish
  /** Packed destination token slug. */
  targetTokenCode: BigNumberish
  /** Packed destination reserve discriminator or WIRE sentinel. */
  targetReserveCode: BigNumberish
  /** Recipient bytes interpreted by the destination chain. */
  targetRecipient: BytesLike
  /** Current destination quote in depot units. */
  targetAmount: BigNumberish
  /** Maximum accepted quote drift in basis points. */
  targetToleranceBps: number
}

/** Classic SPL source details for a Solana reserve swap. */
export interface SolanaSplReserveSwapRequest extends ReserveSwapRequest {
  /** SPL mint configured for the source token code. */
  mint: PublicKey
  /** Optional source token account; the wallet ATA is used when omitted. */
  userTokenAccount?: PublicKey
}
