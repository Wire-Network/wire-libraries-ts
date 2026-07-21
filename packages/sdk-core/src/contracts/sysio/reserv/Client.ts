import type { APIClient } from "../../../api/Client.js"
import type { TransactionExtraOptions } from "../../../api/Types.js"
import type { Action } from "../../../chain/Action.js"
import { UInt64 } from "../../../chain/Integer.js"
import { Name, type NameType } from "../../../chain/Name.js"
import { SignedTransaction } from "../../../chain/Transaction.js"
import { Serializer } from "../../../serializer/index.js"
import {
  SysioReservChainkind,
  SysioReservReservestatus,
  SysioContractName
} from "../../../types/SysioContractTypes.js"
import type * as SysioContracts from "../../../types/SysioContractTypes.js"
import type { ContractTableRowsOptions } from "../../Contract.js"
import { getSysioContract, type SysioContractClient } from "../Client.js"

import { buildMatchReserveAction, buildSwapQuoteAction } from "./Actions.js"
import {
  DEFAULT_RESERV_CONTRACT,
  DEFAULT_RESERVE_QUERY_LIMIT
} from "./Constants.js"
import { reserveSlugString, reserveSlugValue } from "./Slug.js"
import type {
  ListReservesOptions,
  MatchReserveOptions,
  PushMatchReserveOptions,
  ReserveClientOptions,
  ReserveIdentity,
  ReserveQuoteOptions,
  ReserveRecord,
  ReserveRewards
} from "./Types.js"

function enumValue<T extends Record<string, string | number>>(
  enumType: T,
  value: number | keyof T
): number {
  if (typeof value === "number") return value

  const serialized = String(value)
  if (/^[0-9]+$/.test(serialized)) return Number(serialized)

  const mapped = enumType[value]
  if (mapped == null) {
    throw new Error(`Unknown reserve enum value: ${serialized}`)
  }
  return Number(mapped)
}

function rowSlugValue(value: SysioContracts.SysioReservSlugNameType): number {
  const packed = value.value
  return typeof packed === "string" && /^[0-9]+$/.test(packed)
    ? reserveSlugValue(Number(packed))
    : reserveSlugValue(packed)
}

function bigintValue(value: number | string): bigint {
  return BigInt(value.toString())
}

function accountString(value: NameType): string {
  return Name.from(value).toString()
}

function optionalAccountString(value: NameType): string {
  return value ? accountString(value) : ""
}

/** Normalizes a generated reserve row into application-friendly values. */
export function normalizeReserveRow(
  row: SysioContracts.SysioReservReserveRowType
): ReserveRecord {
  const chainCodeValue = rowSlugValue(row.chain_code),
    tokenCodeValue = rowSlugValue(row.token_code),
    reserveCodeValue = rowSlugValue(row.reserve_code)

  return {
    chainCode: reserveSlugString(chainCodeValue),
    chainCodeValue,
    tokenCode: reserveSlugString(tokenCodeValue),
    tokenCodeValue,
    reserveCode: reserveSlugString(reserveCodeValue),
    reserveCodeValue,
    name: row.name,
    description: row.description,
    status: enumValue(
      SysioReservReservestatus,
      row.status
    ) as SysioReservReservestatus,
    chainAmount: bigintValue(row.reserve_chain_amount),
    wireAmount: bigintValue(row.reserve_wire_amount),
    sourceTokenPrecision: row.source_token_precision,
    connectorWeightBps: row.connector_weight_bps,
    creatorChainKind: enumValue(
      SysioReservChainkind,
      row.creator_addr.kind
    ) as SysioReservChainkind,
    creatorAddress: row.creator_addr.address,
    requestedWireAmount: bigintValue(row.requested_wire_amount),
    externalTokenAmount: bigintValue(row.external_token_amount),
    registeredAtMs: bigintValue(row.registered_at_ms),
    activatedAtMs: bigintValue(row.activated_at_ms),
    cancelledAtMs: bigintValue(row.cancelled_at_ms),
    isPrivate: row.is_private,
    owner: optionalAccountString(row.owner),
    creatorPublicKey: row.creator_pub_key,
    raw: row
  }
}

/** Decodes the uint64 return value from a read-only reserve action trace. */
export function decodeReserveUInt64Return(response: any): bigint {
  const traces = response?.processed?.action_traces || [],
    trace = traces.find((candidate: any) => candidate?.act?.name) || traces[0],
    value =
      trace?.return_value_data ??
      trace?.return_value ??
      trace?.return_value_hex_data ??
      trace?.return_value_data_hex

  if (value == null || value === "") {
    throw new Error(
      "Unable to find reserve return value in read-only transaction trace."
    )
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return BigInt(value)
  }

  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    return BigInt(value)
  }

  const decoded = Serializer.decode({ data: value, type: UInt64 }) as UInt64
  return BigInt(decoded.toString())
}

/** UI-neutral client for public `sysio.reserv` reads and user actions. */
export class ReserveClient {
  /** Chain API client used for RPC calls. */
  readonly client: APIClient

  /** Reserve contract account. */
  readonly contract: NameType

  /** Generic typed client for direct public action and table access. */
  readonly contractClient: SysioContractClient<SysioContractName.reserv>

  /** Creates a reserve client. */
  constructor(config: ReserveClientOptions) {
    this.client = config.client
    this.contract = config.contract || DEFAULT_RESERV_CONTRACT
    this.contractClient = getSysioContract(SysioContractName.reserv, {
      client: config.client,
      contract: this.contract
    })
  }

  /** Lists raw generated reserve rows with optional indexed filtering. */
  async listReserveRows(
    options: ListReservesOptions = {}
  ): Promise<SysioContracts.SysioReservReserveRowType[]> {
    const limit = Math.max(
        Math.floor(options.limit || DEFAULT_RESERVE_QUERY_LIMIT),
        1
      ),
      owner = options.owner ? accountString(options.owner) : null,
      rows: SysioContracts.SysioReservReserveRowType[] = []
    let lowerBound: string | undefined

    // The v6 node JSON API currently exposes KV rows through their primary
    // key only. Scan pages and filter locally until named-index traversal is
    // available; callers receive the same stable API when that optimization lands.
    do {
      const query: ContractTableRowsOptions<string> = {
          limit: DEFAULT_RESERVE_QUERY_LIMIT,
          ...(lowerBound ? { lower_bound: lowerBound } : {})
        },
        result = await this.contractClient.tables.reserves.query<string>(query),
        matches = result.rows.filter(row => {
          const status = enumValue(SysioReservReservestatus, row.status),
            chainMatches =
              options.chainCode == null ||
              rowSlugValue(row.chain_code) ===
                reserveSlugValue(options.chainCode),
            tokenMatches =
              options.tokenCode == null ||
              rowSlugValue(row.token_code) ===
                reserveSlugValue(options.tokenCode),
            statusMatches = options.status == null || status === options.status,
            ownerMatches = !owner || optionalAccountString(row.owner) === owner,
            privacyMatches =
              options.isPrivate == null || row.is_private === options.isPrivate

          return (
            chainMatches &&
            tokenMatches &&
            statusMatches &&
            ownerMatches &&
            privacyMatches
          )
        })

      rows.push(...matches.slice(0, limit - rows.length))

      const nextKey = result.more ? result.next_key : undefined
      if (!nextKey || String(nextKey) === lowerBound) {
        break
      }
      lowerBound = String(nextKey)
    } while (rows.length < limit)

    return rows
  }

  /** Lists normalized reserve records with optional indexed filtering. */
  async listReserves(
    options: ListReservesOptions = {}
  ): Promise<ReserveRecord[]> {
    return (await this.listReserveRows(options)).map(normalizeReserveRow)
  }

  /** Reads one reserve by its three-part identity, or null when absent. */
  async getReserve(identity: ReserveIdentity): Promise<ReserveRecord> {
    const reserveCode = reserveSlugValue(identity.reserveCode),
      rows = await this.listReserveRows({
        chainCode: identity.chainCode,
        tokenCode: identity.tokenCode,
        // Exact identity reads must not silently stop at the list-view cap.
        limit: Number.MAX_SAFE_INTEGER
      }),
      row = rows.find(
        candidate => rowSlugValue(candidate.reserve_code) === reserveCode
      )

    return row ? normalizeReserveRow(row) : null
  }

  /** Lists reserves owned by one matched Wire account. */
  async getOwnedReserves(
    owner: NameType,
    options: Omit<ListReservesOptions, "owner"> = {}
  ): Promise<ReserveRecord[]> {
    return this.listReserves({ ...options, owner })
  }

  /** Reads the reserve rewards bucket, returning zeroes before initialization. */
  async getRewards(): Promise<ReserveRewards> {
    const row = await this.contractClient.tables.rewardbkt.first()

    return {
      balance: row ? bigintValue(row.balance) : 0n,
      lifetimeAccrued: row ? bigintValue(row.lifetime_accrued) : 0n
    }
  }

  /** Builds an unsigned Wire action that funds and activates a pending reserve. */
  buildMatchReserveAction(options: MatchReserveOptions): Action {
    return buildMatchReserveAction({ contract: this.contract, ...options })
  }

  /** Builds and pushes a signed Wire transaction that activates a pending reserve. */
  async pushMatchReserve(
    options: PushMatchReserveOptions,
    pushOptions: TransactionExtraOptions = options.pushOptions || {}
  ): Promise<Awaited<ReturnType<APIClient["pushTransaction"]>>> {
    return this.client.pushTransaction(
      this.buildMatchReserveAction(options),
      pushOptions
    )
  }

  /** Builds an unsigned read-only quote action using the deployed reserve curve. */
  buildSwapQuoteAction(options: ReserveQuoteOptions): Action {
    return buildSwapQuoteAction({ contract: this.contract, ...options })
  }

  /** Reads the current on-chain quote for one reserve route. */
  async getSwapQuote(options: ReserveQuoteOptions): Promise<bigint> {
    const response = await this.sendReadOnlyAction(
      this.buildSwapQuoteAction(options)
    )
    return decodeReserveUInt64Return(response)
  }

  private async sendReadOnlyAction(action: Action): Promise<any> {
    const info = await this.client.v1.chain.get_info(),
      transaction = SignedTransaction.from({
        ...info.getTransactionHeader(),
        context_free_actions: [],
        actions: [action],
        transaction_extensions: [],
        signatures: [],
        context_free_data: []
      })

    return this.client.v1.chain.send_read_only_transaction(transaction)
  }
}
