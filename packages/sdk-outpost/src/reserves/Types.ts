import type { PublicKey } from "@solana/web3.js"
import type { ReserveManagerLib } from "@wireio/outpost-ethereum-artifacts"
import type { BigNumberish, BytesLike } from "ethers"

/** Two-part identity shared by external-chain reserve custody clients. */
export interface OutpostReserveIdentity {
  /** Packed external token slug. */
  tokenCode: BigNumberish
  /** Packed reserve discriminator slug. */
  reserveCode: BigNumberish
}

/** Portable reserve fields validated before any external wallet prompt. */
export interface ReserveCreateDefinition extends OutpostReserveIdentity {
  /** External-chain amount escrowed by the creator. */
  externalTokenAmount: BigNumberish
  /** Exact WIRE amount required to activate the reserve. */
  requestedWireAmount: BigNumberish
  /** Bancor connector weight in basis points. */
  connectorWeightBps: number
  /** User-facing reserve name. */
  name: string
  /** User-facing reserve description. */
  description: string
  /** Whether Wire restricts routing to a same-owner external counterpart. */
  isPrivate: boolean
}

/** Ethereum reserve-creation request with the creator's AuthEx public key. */
export interface EthereumReserveCreateRequest extends ReserveCreateDefinition {
  /** Compressed secp256k1 public key that derives to the connected signer. */
  creatorPubKey: BytesLike
}

/** Confirmed external reserve lifecycle submission. */
export interface OutpostReserveSubmission {
  /** External-chain transaction hash or signature. */
  transactionId: string
}

/** Chain-neutral lifecycle states exposed by external reserve clients. */
export enum OutpostReserveStatus {
  pending = "pending",
  active = "active",
  cancelled = "cancelled"
}

/** Normalized Ethereum ReserveManager record. */
export interface EthereumReserveRecord {
  /** Packed external token slug. */
  tokenCode: bigint
  /** Packed reserve discriminator slug. */
  reserveCode: bigint
  /** Raw external amount committed at creation. */
  externalTokenAmount: bigint
  /** Exact WIRE amount requested from the matcher. */
  requestedWireAmount: bigint
  /** Connector weight in basis points. */
  connectorWeightBps: number
  /** Local outpost lifecycle state. */
  status: OutpostReserveStatus
  /** Ethereum creator address. */
  creator: string
  /** Whether the record exists. */
  exists: boolean
}

/** Solana reserve-creation request for the permissionless outpost path. */
export interface SolanaReserveCreateRequest extends ReserveCreateDefinition {
  /** Custody mint for SPL reserves, or a real placeholder SPL mint for native SOL. */
  mint: PublicKey
  /** Creator token-account override. Defaults to the canonical ATA. */
  creatorTokenAccount?: PublicKey
  /** Add an idempotent ATA instruction when no override is supplied. */
  ensureCreatorTokenAccount?: boolean
}

/** Normalized Solana outpost reserve account. */
export interface SolanaReserveRecord {
  /** Reserve account PDA. */
  address: PublicKey
  /** Reserve vault PDA. */
  vaultAddress: PublicKey
  /** Packed external token slug. */
  tokenCode: bigint
  /** Packed reserve discriminator slug. */
  reserveCode: bigint
  /** Raw external amount committed at creation. */
  externalTokenAmount: bigint
  /** Exact WIRE amount requested from the matcher. */
  requestedWireAmount: bigint
  /** Connector weight in basis points. */
  connectorWeightBps: number
  /** Local outpost lifecycle state. */
  status: OutpostReserveStatus
  /** Solana wallet that created and can cancel the reserve. */
  creator: PublicKey
  /** UTF-8 reserve display name. */
  name: string
  /** UTF-8 reserve description. */
  description: string
}

/** Token route configured by the Solana outpost authority. */
export interface SolanaConfiguredReserveToken {
  /** Packed token slug used in reserve instructions. */
  tokenCode: bigint
  /** Configured SPL mint, or the all-zero native marker. */
  mint: PublicKey
  /** Whether the token route represents native SOL. */
  isNative: boolean
  /** Chain-side decimal precision used at the depot boundary. */
  decimals: number
}

/** Permit signature accepted by Ethereum ReserveManager. */
export type EthereumReservePermitSignature = ReserveManagerLib.PermitSigStruct

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
