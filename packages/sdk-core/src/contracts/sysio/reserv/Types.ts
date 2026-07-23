import type { APIClient } from "../../../api/Client.js"
import type { TransactionExtraOptions } from "../../../api/Types.js"
import type { UInt64Type } from "../../../chain/Integer.js"
import type { NameType } from "../../../chain/Name.js"
import type * as SysioContracts from "../../../types/SysioContractTypes.js"

/** Friendly string or packed numeric `slug_name` accepted by reserve helpers. */
export type ReserveSlugName = string | number | bigint

/** Three-part identity that uniquely addresses one reserve. */
export interface ReserveIdentity {
  /** Source outpost chain code. */
  chainCode: ReserveSlugName
  /** Source asset token code. */
  tokenCode: ReserveSlugName
  /** Reserve discriminator code. */
  reserveCode: ReserveSlugName
}

/** Configuration for `ReserveClient`. */
export interface ReserveClientOptions {
  /** Chain API client used for reads and optional signed pushes. */
  client: APIClient
  /** Reserve contract account. Defaults to `sysio.reserv`. */
  contract?: NameType
}

/** Options for listing and filtering reserve rows. */
export interface ListReservesOptions {
  /** Maximum matching rows returned after filtering. Defaults to 500. */
  limit?: number
  /** Optional source outpost chain code. */
  chainCode?: ReserveSlugName
  /** Optional source asset token code. */
  tokenCode?: ReserveSlugName
  /** Optional lifecycle status. */
  status?: SysioContracts.SysioReservReservestatus
  /** Optional Wire owner filter. */
  owner?: NameType
  /** Optional public/private filter. */
  isPrivate?: boolean
}

/** Options for building or pushing `sysio.reserv::matchreserve`. */
export interface MatchReserveOptions extends ReserveIdentity {
  /** AuthEx-linked Wire account funding and owning the reserve. */
  matcher: NameType
  /** Exact requested WIRE amount in nine-decimal base units. */
  wireAmount: UInt64Type | bigint
  /** Wire permission authorizing the action. Defaults to `active`. */
  permission?: NameType
  /** Reserve contract account override. */
  contract?: NameType
}

/** Options for pushing a signed reserve match transaction. */
export interface PushMatchReserveOptions extends MatchReserveOptions {
  /** Optional push behavior such as finality waiting. */
  pushOptions?: TransactionExtraOptions
}

/** Options for a read-only reserve-to-reserve quote. */
export interface ReserveQuoteOptions {
  /** Source reserve identity. */
  from: ReserveIdentity
  /** Source amount in the reserve's depot precision frame. */
  fromAmount: UInt64Type | bigint
  /** Destination reserve identity. */
  to: ReserveIdentity
  /** Reserve contract account override. */
  contract?: NameType
}

/** Normalized reserve row intended for application and service integrations. */
export interface ReserveRecord {
  /** Friendly source chain code. */
  chainCode: string
  /** Packed source chain code. */
  chainCodeValue: number
  /** Friendly source token code. */
  tokenCode: string
  /** Packed source token code. */
  tokenCodeValue: number
  /** Friendly reserve discriminator code. */
  reserveCode: string
  /** Packed reserve discriminator code. */
  reserveCodeValue: number
  /** User-facing reserve name. */
  name: string
  /** User-facing reserve description. */
  description: string
  /** Canonical reserve lifecycle status. */
  status: SysioContracts.SysioReservReservestatus
  /** Current external-chain book amount in depot units. */
  chainAmount: bigint
  /** Current WIRE book amount in WIRE base units. */
  wireAmount: bigint
  /** External-token precision recorded by the outpost. */
  sourceTokenPrecision: number
  /** WIRE-side connector weight in basis points. */
  connectorWeightBps: number
  /** Creator's external chain kind. */
  creatorChainKind: SysioContracts.SysioReservChainkind
  /** Creator's external address bytes as returned by the chain API. */
  creatorAddress: string
  /** Exact WIRE amount required to activate a pending reserve. */
  requestedWireAmount: bigint
  /** Original external amount recorded at creation. */
  externalTokenAmount: bigint
  /** Depot registration timestamp in milliseconds. */
  registeredAtMs: bigint
  /** Activation timestamp in milliseconds, or zero while inactive. */
  activatedAtMs: bigint
  /** Cancellation timestamp in milliseconds, or zero while not cancelled. */
  cancelledAtMs: bigint
  /** Whether swaps are restricted to same-owner private counterparts. */
  isPrivate: boolean
  /** Wire account that matched the reserve, empty while pending. */
  owner: string
  /** Creator public-key bytes recorded by the depot. */
  creatorPublicKey: string
  /** Original generated row for integrations that need raw field names. */
  raw: SysioContracts.SysioReservReserveRowType
}

/** Normalized reserve rewards bucket. */
export interface ReserveRewards {
  /** WIRE rewards awaiting distribution. */
  balance: bigint
  /** Lifetime WIRE rewards routed to the bucket. */
  lifetimeAccrued: bigint
}
