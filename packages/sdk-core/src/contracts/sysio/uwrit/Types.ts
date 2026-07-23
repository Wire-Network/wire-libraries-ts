import type { APIClient } from "../../../api/Client.js"
import type { TransactionExtraOptions } from "../../../api/Types.js"
import type { NameType } from "../../../chain/Name.js"
import type {
  SysioUwritAttestationtype,
  SysioUwritChainkind,
  SysioUwritUnderwriterequeststatus,
  SysioUwritUnderwritestatus
} from "../../../types/SysioContractTypes.js"
import type * as SysioContracts from "../../../types/SysioContractTypes.js"
import type { ReserveIdentity, ReserveSlugName } from "../reserv/Types.js"

/** Configuration for `UnderwritingClient`. */
export interface UnderwritingClientOptions {
  /** Chain API client used for reads and signed pushes. */
  client: APIClient
  /** Underwriting contract override. Defaults to `sysio.uwrit`. */
  contract?: NameType
}

/** Filters for underwriting request history. */
export interface ListUnderwritingRequestsOptions {
  /** Optional lifecycle status. */
  status?: SysioUwritUnderwriterequeststatus
  /** Optional source chain slug. */
  sourceChainCode?: ReserveSlugName
  /** Optional destination chain slug. */
  destinationChainCode?: ReserveSlugName
  /** Maximum rows returned. Defaults to 500. */
  limit?: number
}

/** Filters for queued WIRE-origin swaps. */
export interface ListFromWireQueueOptions {
  /** Optional depositor account. */
  user?: NameType
  /** Maximum rows returned. Defaults to 500. */
  limit?: number
}

/** Input for `sysio.uwrit::swapfromwire`. */
export interface SwapFromWireOptions {
  /** Wire account escrowing WIRE into reserve custody. */
  user: NameType
  /** WIRE input in nine-decimal base units. */
  wireAmount: number | string | bigint
  /** Destination external reserve. */
  destination: ReserveIdentity
  /** Current quoted destination amount in depot units. */
  targetAmount: number | string | bigint
  /** Maximum accepted quote drift in basis points. */
  targetToleranceBps: number
  /** Destination signing/address family. */
  recipientKind: SysioUwritChainkind | keyof typeof SysioUwritChainkind
  /** Raw destination address bytes accepted by the deployed contract. */
  recipientAddress: string
  /** Wire permission authorizing escrow. Defaults to `active`. */
  permission?: NameType
  /** Optional push behavior such as waiting for finality. */
  pushOptions?: TransactionExtraOptions
}

/** Normalized underwriter commitment for one swap leg. */
export interface UnderwritingCommitRecord {
  /** Underwriter account. */
  underwriter: string
  /** Source outpost receipt time. */
  sourceReceivedAtMs: bigint
  /** Destination outpost receipt time. */
  destinationReceivedAtMs: bigint
  /** Current commitment lifecycle status. */
  status: SysioUwritUnderwritestatus
  /** Protocol reason when disqualified or rejected. */
  reason: string
  /** Original generated commitment. */
  raw: SysioContracts.SysioUwritCommitEntryType
}

/** Normalized swap request coordinated by `sysio.uwrit`. */
export interface UnderwritingRequestRecord {
  /** Protocol request identifier. */
  id: bigint
  /** Original cross-chain attestation type. */
  type: SysioUwritAttestationtype
  /** Current request lifecycle status. */
  status: SysioUwritUnderwriterequeststatus
  /** Source reserve identity. */
  source: ReserveIdentity
  /** Source amount in depot units. */
  sourceAmount: bigint
  /** Destination reserve identity. */
  destination: ReserveIdentity
  /** Quoted destination amount in depot units. */
  destinationAmount: bigint
  /** Accepted quote drift in basis points. */
  toleranceBps: number
  /** Raw protocol source-request bytes returned by the chain API. */
  sourceTransactionId: string
  /**
   * Decoded outpost deposit id, or the synthetic WIRE queue/request id.
   *
   * This is the stable correlation value emitted by source-chain swap
   * submission. It is not an EVM transaction hash or Solana signature.
   */
  sourceRequestId?: bigint
  /** Raw source-chain depositor address bytes returned by the chain API. */
  depositor: string
  /** Decoded Wire depositor for WIRE-origin requests. */
  depositorAccount?: string
  /** Underwriter commitments received for this request. */
  commits: UnderwritingCommitRecord[]
  /** Winning underwriter account, empty while unresolved. */
  winner: string
  /** Settlement timestamp in milliseconds. */
  settledAtMs: bigint
  /** Epoch after which an unresolved request expires. */
  expiresAtEpoch: number
  /** Original generated request row. */
  raw: SysioContracts.SysioUwritUwRequestTType
}

/** Normalized WIRE-origin swap awaiting the next epoch drain. */
export interface FromWireQueueRecord {
  /** Queue identifier. */
  id: bigint
  /** Wire depositor account. */
  user: string
  /** Escrowed WIRE amount. */
  wireAmount: bigint
  /** Destination external reserve. */
  destination: ReserveIdentity
  /** Current quoted destination amount. */
  targetAmount: bigint
  /** Accepted quote drift in basis points. */
  toleranceBps: number
  /** Destination signing/address family. */
  recipientKind: SysioUwritChainkind
  /** Raw destination recipient bytes. */
  recipientAddress: string
  /** Epoch in which the queue entry was created. */
  createdAtEpoch: number
  /** Original generated queue row. */
  raw: SysioContracts.SysioUwritFromwireQType
}

/** Normalized underwriting configuration used for client preflight. */
export interface UnderwritingConfig {
  /** Protocol fee in basis points. */
  feeBps: number
  /** Collateral lock duration in milliseconds. */
  collateralLockDurationMs: bigint
  /** Minimum WIRE-origin input amount. */
  minimumFromWireAmount: bigint
  /** Fee retained when a WIRE-origin swap reverts. */
  fromWireRevertFeeBps: number
}
